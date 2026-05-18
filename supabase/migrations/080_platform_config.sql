-- Tabla key-value para parámetros de negocio que cambian sin redeploy.
-- Hoy: take_rate_pct (comisión MP sobre torneos), estelar_price_cents,
-- refund_window_days. Mañana: cualquier umbral, switch o tarifa.
--
-- RLS: solo admin lee. Mutación vía service role desde acciones admin.
create table if not exists public.platform_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.platform_config enable row level security;

drop policy if exists platform_config_admin_read on public.platform_config;
create policy platform_config_admin_read on public.platform_config
  for select using (mp_is_admin());

insert into public.platform_config (key, value, description) values
  ('take_rate_pct', '10'::jsonb, 'Porcentaje de comisión MatchPoint sobre transacciones de torneo (%)'),
  ('estelar_price_cents', '2000'::jsonb, 'Costo de marcar un torneo como estelar (en cents, USD)'),
  ('refund_window_days', '7'::jsonb, 'Plazo máximo (días) para devolver cuotas tras cancelar un torneo')
on conflict (key) do nothing;
