-- 048 · Planes de jugador (free / premium).
--
-- Modelo:
--   - profiles.plan_tier guarda el plan vigente (default 'free').
--   - profiles.plan_expires_at: cuando vence (null para free permanente).
--   - player_subscriptions guarda historial de upgrades pendientes/activos.
--     Reusa el flujo de comprobantes del Agente F vía transaction_id.
--
-- Flujo:
--   1. Usuario llama requestPlanUpgrade → crea transactions pending_proof
--      + player_subscriptions con status='pending'.
--   2. Usuario sube comprobante en /pagos/[transactionId].
--   3. Admin aprueba → approvePlanSubscriptionAdmin: transaction='captured',
--      subscription='active', profiles.plan_tier/expires_at actualizados.
--   4. Cron futuro: marca expired cuando expires_at < now.
--
-- RLS: user lee sus propias subs; insert para sí mismo; update solo admin.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'mp_player_plan') then
    create type mp_player_plan as enum ('free', 'premium');
  end if;
end $$;

alter table public.profiles
  add column if not exists plan_tier mp_player_plan not null default 'free',
  add column if not exists plan_expires_at timestamptz;

create table if not exists public.player_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tier mp_player_plan not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'cancelled', 'rejected')),
  starts_at timestamptz,
  expires_at timestamptz,
  duration_months int not null default 1 check (duration_months > 0),
  transaction_id uuid references public.transactions(id),
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_player_subs_user_status
  on public.player_subscriptions (user_id, status);
create index if not exists idx_player_subs_expires
  on public.player_subscriptions (expires_at)
  where status = 'active';

alter table public.player_subscriptions enable row level security;

drop policy if exists "player_subs_own_select" on public.player_subscriptions;
create policy "player_subs_own_select" on public.player_subscriptions
  for select using (user_id = auth.uid() or public.mp_is_admin());

drop policy if exists "player_subs_own_insert" on public.player_subscriptions;
create policy "player_subs_own_insert" on public.player_subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists "player_subs_admin_update" on public.player_subscriptions;
create policy "player_subs_admin_update" on public.player_subscriptions
  for update using (public.mp_is_admin());
