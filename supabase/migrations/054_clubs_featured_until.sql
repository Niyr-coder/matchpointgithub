-- 054 · Promoción pagada de clubes en listings ("destacado").
--
-- Modelo:
--   - clubs.featured_until timestamptz nullable.
--   - NULL = club no pagó featuring. featured_until > now() = activo.
--   - Cuando expira (featured_until < now()) los consumidores deben
--     tratarlo como NULL: no aparece en el slot destacado.
--   - Se renueva pagando: igual que los planes de jugador, reusa el flujo
--     de comprobantes (transactions kind='club_featuring'). La aprobación
--     extiende featured_until N días desde el expiry vigente.
--
-- TODO (no en esta migration):
--   - Server actions: requestClubFeaturing / approveClubFeaturingAdmin.
--   - UI: owner del club ve estado en el panel; admin aprueba en
--     /dashboard/admin/admin-plans (o un panel propio).
--   - Cron: al expirar, opcional encolar notif "Tu featuring expira".
--
-- Esta migration solo agrega la columna y el índice parcial.

alter table public.clubs
  add column if not exists featured_until timestamptz;

create index if not exists idx_clubs_featured_active
  on public.clubs (featured_until desc)
  where featured_until is not null;

comment on column public.clubs.featured_until is
  'Hasta cuándo el club está pagado para aparecer como "destacado" en listings. NULL = no destacado. Cuando expires_at < now() se trata como NULL en lectura.';
