-- 124 · No-show + fiabilidad (Stage 3 del ciclo de vida de matches).
-- Ver docs/product/04-matches-lifecycle.md.
--
-- Detrás del flag match_reliability_enabled (default OFF). Backend completo;
-- la UI de reportar/badge se monta como sub-stage cuando se prenda el flag.

-- ── Tablas ──────────────────────────────────────────────────────────────
-- Contadores por jugador. El score se computa en código (src/lib/reliability.ts).
create table player_reliability (
  user_id uuid primary key references profiles(id) on delete cascade,
  no_shows int not null default 0,
  cancellations int not null default 0,
  updated_at timestamptz not null default now()
);

-- Registro de inasistencias reportadas. Un participante reporta que otro no
-- apareció. Unique evita doble reporte del mismo reporter sobre el mismo no-show.
create table match_no_shows (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  reported_by uuid not null references profiles(id) on delete cascade,
  no_show_user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (match_id, reported_by, no_show_user_id),
  constraint mns_not_self check (reported_by <> no_show_user_id)
);

create index idx_mns_no_show_user on match_no_shows (no_show_user_id);
create index idx_mns_match on match_no_shows (match_id);

create trigger tg_player_reliability_updated_at
  before update on player_reliability
  for each row execute function tg_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table player_reliability enable row level security;
-- El score es público (badge visible). Solo el sistema/admin lo muta.
create policy pr_public_select on player_reliability for select using (true);
create policy pr_admin_write on player_reliability for all using (mp_is_admin()) with check (mp_is_admin());

alter table match_no_shows enable row level security;
-- Visible para participantes del match reportado o admin.
create policy mns_select on match_no_shows for select using (
  reported_by = auth.uid()
  or no_show_user_id = auth.uid()
  or mp_is_admin()
  or exists (
    select 1 from matches m
    where m.id = match_id
      and (auth.uid() = any (m.team_a_player_ids) or auth.uid() = any (m.team_b_player_ids))
  )
);
-- El reporte se hace vía action con service role (valida participante + ventana),
-- así que el insert directo por JWT queda solo para admin.
create policy mns_admin_insert on match_no_shows for insert with check (mp_is_admin());

-- ── Audit ─────────────────────────────────────────────────────────────────
create trigger tg_audit_match_no_shows
  after insert or update or delete on match_no_shows
  for each row execute function tg_audit();

-- ── Feature flag ────────────────────────────────────────────────────────
insert into feature_flags (key, description, enabled_default, rollout_pct)
values ('match_reliability_enabled',
  'No-show + score de fiabilidad: reportar inasistencias y mostrar badge de fiabilidad.',
  false, 0)
on conflict (key) do nothing;

-- ── Notif kind ────────────────────────────────────────────────────────────
insert into notification_kinds (kind, description, allowed_roles, default_channels, category) values
  ('match_no_show_reported','Te reportaron como inasistencia en un partido',
   array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'matches')
on conflict (kind) do nothing;

-- Dispatcher: branch nuevo (recreamos manteniendo los branches previos del 122).
create or replace function public.fn_dispatch_inapp_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare
  _job record; _kind text; _payload jsonb; _title text; _body text; _link text;
  _notif_id uuid; _existing_notif uuid; _processed int := 0; _err text;
begin
  for _job in
    select id, user_id, role, kind, payload from public.notification_jobs
     where status = 'pending' and channel = 'inapp'
     order by scheduled_for asc limit 500 for update skip locked
  loop
    begin
      _kind := _job.kind; _payload := coalesce(_job.payload, '{}'::jsonb);
      _title := nullif(_payload->>'title', ''); _body := nullif(_payload->>'body', '');
      _link := null; _notif_id := null;

      if _kind = 'event_rescheduled' then
        if _title is null then _title := 'Tu evento cambió de fecha'; end if;
        if _body is null then _body := coalesce(_payload->>'event_name', 'Un evento') || ' fue reprogramado.'; end if;
        if _payload ? 'event_id' then _link := '/eventos/' || (_payload->>'event_id'); end if;
      elsif _kind = 'tournament_rescheduled' then
        if _title is null then _title := 'Tu torneo cambió de fecha'; end if;
        if _body is null then _body := coalesce(_payload->>'tournament_name', _payload->>'event_name', 'Un torneo') || ' fue reprogramado.'; end if;
        if _payload ? 'tournament_id' then _link := '/eventos/' || coalesce(_payload->>'tournament_slug', _payload->>'tournament_id'); end if;
      elsif _kind = 'tournament_cancelled' then
        if _title is null then _title := 'Tu torneo fue cancelado'; end if;
        if _body is null then _body := coalesce(_payload->>'tournament_name', 'Un torneo') || ' fue cancelado por el organizador. Si pagaste cuota, te será devuelta.'; end if;
        if _payload ? 'tournament_id' then _link := '/eventos/' || coalesce(_payload->>'tournament_slug', _payload->>'tournament_id'); end if;
      elsif _kind = 'registration_accepted' then
        if _title is null then _title := 'Inscripción aceptada'; end if;
        if _body is null then _body := 'Tu inscripción a ' || coalesce(_payload->>'tournament_name', 'el torneo') || ' fue aceptada. ¡Nos vemos en cancha!'; end if;
        if _payload ? 'tournament_id' then _link := '/dashboard/eventos/' || coalesce(_payload->>'tournament_slug', _payload->>'tournament_id'); end if;
      elsif _kind = 'registration_rejected' then
        if _title is null then _title := 'Inscripción rechazada'; end if;
        if _body is null then _body := 'Tu inscripción a ' || coalesce(_payload->>'tournament_name', 'el torneo') || ' fue rechazada por el organizador.'; end if;
        if _payload ? 'tournament_id' then _link := '/dashboard/eventos/' || coalesce(_payload->>'tournament_slug', _payload->>'tournament_id'); end if;
      elsif _kind = 'payment_proof_rejected' then
        if _title is null then _title := 'Comprobante de pago rechazado'; end if;
        if _body is null then _body := coalesce(_payload->>'rejection_reason', 'El administrador rechazó tu comprobante. Sube uno nuevo desde el detalle del pago.'); end if;
        _link := '/dashboard/user/mi-plan';
      elsif _kind = 'plan_expiring_soon' then
        if _title is null then _title := 'Tu plan Premium expira pronto'; end if;
        if _body is null then
          if _payload ? 'days_remaining' then _body := 'Vence en ' || (_payload->>'days_remaining') || ' días.';
          else _body := 'Tu plan Premium está por vencer.'; end if;
        end if;
        _link := '/dashboard/user/mi-plan';
      elsif _kind = 'reservation_created' then
        if _title is null then _title := 'Reserva confirmada'; end if;
        if _body is null then
          _body := trim(both ' · ' from concat_ws(' · ', _payload->>'club_name', _payload->>'court_name', _payload->>'starts_at'));
          if _body = '' then _body := 'Tu reserva fue confirmada.'; end if;
        end if;
        _link := '/dashboard/user/reservas';
      elsif _kind = 'match_seek_applied' then
        if _title is null then _title := 'Nueva postulación'; end if;
        if _body is null then _body := coalesce(_payload->>'applicant_name', 'Un jugador') || ' se postuló a tu "Busco partido". Revisa y acepta para jugar.'; end if;
        _link := '/dashboard/user/busco-partido';
        if _payload ? 'seek_id' then _link := _link || '?focus=' || (_payload->>'seek_id'); end if;
      elsif _kind = 'match_seek_accepted' then
        if _title is null then _title := 'Te aceptaron el partido'; end if;
        if _body is null then _body := coalesce(_payload->>'author_name', 'El autor') || ' aceptó tu postulación. Coordinen por el chat del partido.'; end if;
        if _payload ? 'conversation_id' then _link := '/dashboard/user/chat?conv=' || (_payload->>'conversation_id');
        else _link := '/dashboard/user/busco-partido'; end if;
      elsif _kind = 'match_cancelled' then
        if _title is null then _title := 'Tu partido fue cancelado'; end if;
        if _body is null then _body := coalesce(_payload->>'canceller_name', 'El otro jugador') || ' canceló el partido' || coalesce(' · ' || nullif(_payload->>'reason', ''), '') || '.'; end if;
        if _payload ? 'conversation_id' then _link := '/dashboard/user/chat?conv=' || (_payload->>'conversation_id'); end if;
      elsif _kind = 'match_rescheduled' then
        if _title is null then _title := 'Tu partido cambió de hora'; end if;
        if _body is null then _body := coalesce(_payload->>'rescheduler_name', 'El otro jugador') || ' propuso una nueva fecha para el partido. Revisa el chat.'; end if;
        if _payload ? 'conversation_id' then _link := '/dashboard/user/chat?conv=' || (_payload->>'conversation_id'); end if;
      elsif _kind = 'match_no_show_reported' then
        if _title is null then _title := 'Te reportaron una inasistencia'; end if;
        if _body is null then _body := coalesce(_payload->>'reporter_name', 'Un jugador') || ' marcó que no asististe a un partido. Esto afecta tu fiabilidad.'; end if;
        if _payload ? 'conversation_id' then _link := '/dashboard/user/chat?conv=' || (_payload->>'conversation_id'); end if;
      else
        if _title is null then _title := _kind; end if;
        if _body is null then _body := _payload::text; end if;
        _link := null;
      end if;

      if _payload ? 'notification_id' then
        begin _existing_notif := (_payload->>'notification_id')::uuid;
        exception when others then _existing_notif := null; end;
      end if;
      if _existing_notif is not null then
        update public.notifications set link = coalesce(link, _link), delivered_at = coalesce(delivered_at, now()) where id = _existing_notif;
        if found then _notif_id := _existing_notif; end if;
      end if;
      if _notif_id is null then
        insert into public.notifications (recipient_user_id, recipient_role, kind, title, body, payload, link, delivered_at)
        values (_job.user_id, _job.role, _kind, _title, _body, _payload, _link, now()) returning id into _notif_id;
      end if;
      update public.notification_jobs set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = _job.id;
      _processed := _processed + 1;
    exception when others then
      _err := SQLERRM;
      update public.notification_jobs set status = 'failed', attempts = attempts + 1, last_error = _err where id = _job.id;
    end;
  end loop;
  return _processed;
end;
$$;
