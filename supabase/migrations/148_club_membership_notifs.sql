-- 148 · notification_kinds de membresías de club + branches en el dispatcher.
--   - club_membership_requested → staff del club (alguien compró/solicitó, revisar pago)
--   - club_membership_activated  → usuario (su tarjeta VIP quedó activa)
--   - club_membership_expiring_soon → usuario (cron, vence ≤7d)

insert into notification_kinds (kind, description, allowed_roles, default_channels, category) values
  ('club_membership_requested','Nueva solicitud de membresía en tu club',
   array['owner','manager']::mp_role[], array['inapp']::mp_notification_channel[], 'clubs'),
  ('club_membership_activated','Tu membresía VIP quedó activa',
   array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'clubs'),
  ('club_membership_expiring_soon','Tu membresía VIP vence pronto',
   array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'clubs')
on conflict (kind) do nothing;

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
      elsif _kind = 'team_member_kicked' then
        if _title is null then _title := 'Saliste de un equipo'; end if;
        if _body is null then
          _body := 'Fuiste removido de ' || coalesce(_payload->>'team_name', 'tu equipo')
                || coalesce('. Motivo: ' || nullif(_payload->>'reason_label',''), '') || '.';
        end if;
        _link := '/dashboard/user/team';
      elsif _kind = 'quedada_payment_reminder' then
        if _title is null then _title := 'Recordatorio de pago'; end if;
        if _body is null then
          _body := 'El organizador de ' || coalesce(_payload->>'quedada_title', 'una quedada')
                || ' te recuerda completar tu pago'
                || coalesce(' de ' || nullif(_payload->>'amount_label',''), '') || '.';
        end if;
        if _payload ? 'quedada_id' then _link := '/dashboard/user/quedada/' || (_payload->>'quedada_id'); end if;
      elsif _kind = 'quedada_rescheduled' then
        if _title is null then _title := 'Una quedada cambió de fecha'; end if;
        if _body is null then
          _body := coalesce(_payload->>'quedada_title', 'Una quedada')
                || ' fue reprogramada'
                || coalesce(' para el ' || nullif(_payload->>'starts_label',''), '') || '.';
        end if;
        if _payload ? 'quedada_id' then _link := '/dashboard/user/quedada/' || (_payload->>'quedada_id'); end if;
      elsif _kind = 'club_membership_requested' then
        if _title is null then _title := 'Nueva solicitud de membresía'; end if;
        if _body is null then
          _body := coalesce(_payload->>'member_name', 'Un usuario')
                || ' compró la membresía ' || coalesce(_payload->>'tier_name', 'VIP')
                || '. Revisa el pago para activarla.';
        end if;
        _link := '/dashboard/owner/club-membresias';
      elsif _kind = 'club_membership_activated' then
        if _title is null then _title := 'Tu membresía VIP está activa'; end if;
        if _body is null then
          _body := 'Ya eres miembro ' || coalesce(_payload->>'tier_name', 'VIP')
                || coalesce(' de ' || nullif(_payload->>'club_name',''), '')
                || coalesce('. Vence el ' || nullif(_payload->>'expires_label',''), '') || '.';
        end if;
        _link := '/dashboard/user/membresias';
      elsif _kind = 'club_membership_expiring_soon' then
        if _title is null then _title := 'Tu membresía VIP vence pronto'; end if;
        if _body is null then
          _body := 'Tu membresía ' || coalesce(_payload->>'tier_name', 'VIP')
                || coalesce(' de ' || nullif(_payload->>'club_name',''), '')
                || ' vence pronto. Renuévala para no perder tus beneficios.';
        end if;
        _link := '/dashboard/user/membresias';
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
