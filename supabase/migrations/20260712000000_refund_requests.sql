-- 20260712000000 · Cola de reembolsos pendientes de torneo (refund_requests).
--
-- Problema (docs/product/02-payments.md §5, TODO): cuando un jugador cancela
-- con pago capturado, cancelMyRegistration devolvía refundRequired=true que
-- moría en un toast — ningún registro persistente, ninguna notif al
-- organizador. Y al cancelar un torneo, el partner debía ir tx por tx sin
-- ninguna cola que le diga qué debe devolver.
--
-- Esta tabla es la cola de "reembolsos por hacer". El registro FINAL del
-- reembolso sigue siendo la tabla `refunds` + transactions.status='refunded'
-- (mig 010/043) — esto solo trackea el pendiente y su vencimiento
-- (platform_config.refund_window_days, default 7).
--
-- unique(transaction_id): una request por transacción — dedup natural entre
-- el path individual (jugador cancela) y el masivo (torneo cancelado).

create table public.refund_requests (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references transactions(id) on delete cascade,
  registration_id uuid references registrations(id) on delete set null,
  tournament_id   uuid not null references tournaments(id) on delete cascade,
  requested_by    uuid references profiles(id) on delete set null,
  reason          text not null,
  status          text not null default 'pending' check (status in ('pending', 'done', 'dismissed')),
  due_at          timestamptz,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references profiles(id) on delete set null,
  unique (transaction_id)
);

create index idx_refund_requests_tournament on public.refund_requests (tournament_id, status);

comment on table public.refund_requests is
  'Cola de reembolsos pendientes de torneo. El reembolso final vive en refunds + transactions.status=refunded; aquí solo el pendiente + vencimiento.';

-- Audit
create trigger tg_audit_refund_requests
  after insert or update or delete on public.refund_requests
  for each row execute function tg_audit();

-- RLS: admin todo; partner/club staff del torneo solo lectura (las escrituras
-- van por service role desde server actions con setAuditActor).
alter table public.refund_requests enable row level security;

create policy rr_admin_all on public.refund_requests
  for all using (public.mp_is_admin());

create policy rr_editor_select on public.refund_requests
  for select using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (
          (t.partner_id is not null and mp_is_partner_admin_of(t.partner_id))
          or (t.club_id is not null and mp_club_staff(t.club_id))
        )
    )
  );

-- Notif al organizador cuando entra un reembolso a la cola. Render vía
-- payload title/body (patrón mig 20260630100000); href client-side en
-- NotificationsPanel.
insert into notification_kinds (kind, description, allowed_roles, default_channels, category)
values (
  'refund_requested',
  'Hay un reembolso pendiente por procesar en tu torneo',
  array['partner', 'owner', 'manager']::mp_role[],
  array['inapp']::mp_notification_channel[],
  'pagos'
)
on conflict (kind) do update set
  description      = excluded.description,
  allowed_roles    = excluded.allowed_roles,
  default_channels = excluded.default_channels,
  category         = excluded.category;
