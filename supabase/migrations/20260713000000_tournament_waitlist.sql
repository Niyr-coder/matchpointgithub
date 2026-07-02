-- 20260713000000 · Waitlist de torneo (opt-in por torneo).
--
-- El enum de registrations.status ya incluía 'waitlist' desde mig 020 y el
-- pill "ESPERA" existía en la gestión del partner, pero NADA lo escribía:
-- registerToTournament lanzaba CATEGORY_FULL/TOURNAMENT_FULL y no había
-- promoción (tampoco existe en clases — ver audit 2026-07-01).
--
-- Esta migración agrega:
--   1. tournaments.allow_waitlist (default false, toggle en el wizard).
--   2. La columna en tournaments_public_summary (los CTA de las cards la
--      necesitan para ofrecer "lista de espera" en torneos llenos).
--   3. Kinds registration_waitlisted / waitlist_promoted.
--
-- Semántica (docs/product/01-tournaments.md):
--   - waitlist NO consume cupo (los counts de cupo usan pending+accepted).
--   - waitlist NO genera transacción de pago; al promover pasa a 'pending'
--     y sigue el flujo normal de pago/comprobante.
--   - Promoción FIFO por created_at al liberarse un cupo, misma categoría.

alter table public.tournaments
  add column if not exists allow_waitlist boolean not null default false;

comment on column public.tournaments.allow_waitlist is
  'Permite lista de espera cuando el torneo/categoría está lleno. Waitlist no consume cupo ni genera pago; se promueve FIFO al liberarse cupo.';

-- Recrear la vista pública con la columna nueva (def base: mig
-- 20260610120000 — security_invoker restaurado).
drop view if exists public.tournaments_public_summary;
create view public.tournaments_public_summary
with (security_invoker = true) as
  select
    t.id,
    t.slug,
    t.name,
    t.starts_at,
    t.ends_at,
    t.prize_pool_cents,
    t.entry_fee_cents,
    t.currency,
    t.max_participants,
    t.sport,
    t.format,
    t.status,
    c.name as club_name,
    c.city as club_city,
    (
      select count(*)::bigint
      from registrations r
      where r.tournament_id = t.id
        and r.status = any (array['pending'::text, 'accepted'::text])
    ) as registrations_count,
    t.is_featured,
    t.allow_waitlist
  from tournaments t
  left join clubs c on c.id = t.club_id
  where t.status <> all (array['draft'::mp_event_status, 'cancelled'::mp_event_status]);

grant select on public.tournaments_public_summary to anon, authenticated;

-- Notifs (render vía payload title/body, href client-side en NotificationsPanel)
insert into notification_kinds (kind, description, allowed_roles, default_channels, category)
values
  (
    'registration_waitlisted',
    'Quedaste en lista de espera de un torneo lleno',
    array['user']::mp_role[],
    array['inapp']::mp_notification_channel[],
    'tournaments'
  ),
  (
    'waitlist_promoted',
    'Se liberó un cupo y tu inscripción de torneo pasó de lista de espera a pendiente',
    array['user']::mp_role[],
    array['inapp']::mp_notification_channel[],
    'tournaments'
  )
on conflict (kind) do update set
  description      = excluded.description,
  allowed_roles    = excluded.allowed_roles,
  default_channels = excluded.default_channels,
  category         = excluded.category;
