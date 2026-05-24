-- 171 · paywall_events: telemetría para optimizar conversion funnel de pricing
-- y paywalls in-product.
--
-- Spec en MAT-1 §5.3 (versión simplificada para MAT-27): un único log
-- write-only de eventos. La columna `props jsonb` carga payload variable
-- (tier_key, audience, billing_period, faq_key, entitlement_key, etc.).
--
-- Diseño:
-- - `user_id` nullable para soportar landing anónima (/precios).
-- - `session_id` text para correlacionar eventos de la misma sesión anon.
-- - Solo writes — no leemos desde el cliente. RLS bloquea SELECT desde anon
--   y user (data privada de funnel). Admin/service-role hacen analítica.
-- - Inserción vía service-role (endpoint /api/v1/telemetry/pricing).

create table if not exists paywall_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  props jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_paywall_events_event_time
  on paywall_events (event_name, occurred_at desc);

create index if not exists idx_paywall_events_user_time
  on paywall_events (user_id, occurred_at desc)
  where user_id is not null;

create index if not exists idx_paywall_events_session
  on paywall_events (session_id, occurred_at desc)
  where session_id is not null;

alter table paywall_events enable row level security;

-- Sin policies de select/insert para anon/authenticated: la tabla solo se
-- escribe vía service-role desde el endpoint de telemetría, y solo admin
-- la consulta. RLS denegando-por-defecto es lo deseado.
--
-- Admin lectura (analítica/funnel).
drop policy if exists pwe_admin_select on paywall_events;
create policy pwe_admin_select on paywall_events for select using (mp_is_admin());
