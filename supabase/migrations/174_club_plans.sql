-- 174 · Planes de club (starter / pro / partner) — MAT-70 Slice 1.
--
-- Espejo del modelo player (mig 048) pero para clubes. La página /precios
-- promete públicamente: Club Starter (free, capado), Club Pro ($29, ilimitado)
-- y Partner (contrato custom). El dominio actual de DB no modela esto: la
-- tabla clubs no tiene noción de plan y ningún caller filtra por tier de club.
-- Esta migration agrega la infra mínima para enforzar los caps publicados.
--
-- Modelo:
--   - clubs.plan_tier guarda el plan vigente (default 'starter').
--   - clubs.plan_expires_at: cuándo vence (null = vigencia indefinida).
--   - club_subscriptions guarda historial de upgrades.
--
-- Flujo (Slice 1: solo grant admin directo; sin self-service todavía):
--   - Admin llama grantClubPlanAdmin → club_subscriptions row 'active'
--     inmediato + clubs.plan_tier/expires_at actualizados.
--   - Cron diario (fn_process_club_plans) hace expire/downgrade igual que
--     el player cron.
--
-- Self-service con comprobante de pago (espejo de player) es Slice futuro
-- una vez decidamos pricing definitivo de Pro y si va vía transferencia o PSP.
--
-- RLS: staff del club lee sus subs; admin all (insert/update/delete).
-- (Self-insert no se permite para empezar — solo admin puede activar.)

-- ── Enum ────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'mp_club_plan') then
    create type mp_club_plan as enum ('starter', 'pro', 'partner');
  end if;
end $$;

-- ── Columnas en clubs ───────────────────────────────────────────────────
alter table public.clubs
  add column if not exists plan_tier mp_club_plan not null default 'starter',
  add column if not exists plan_expires_at timestamptz;

create index if not exists idx_clubs_plan_tier
  on public.clubs (plan_tier)
  where plan_tier <> 'starter';

-- ── Tabla de subscriptions ──────────────────────────────────────────────
create table if not exists public.club_subscriptions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  tier mp_club_plan not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'cancelled', 'rejected')),
  starts_at timestamptz,
  expires_at timestamptz,
  duration_months int not null default 1 check (duration_months > 0),
  transaction_id uuid references public.transactions(id),
  granted_by uuid references public.profiles(id),
  granted_reason text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_club_subs_club_status
  on public.club_subscriptions (club_id, status);
create index if not exists idx_club_subs_expires
  on public.club_subscriptions (expires_at)
  where status = 'active';

-- updated_at trigger (mismo helper que usa el resto del schema).
drop trigger if exists tg_club_subs_updated on public.club_subscriptions;
create trigger tg_club_subs_updated before update on public.club_subscriptions
  for each row execute function tg_set_updated_at();

alter table public.club_subscriptions enable row level security;

drop policy if exists "club_subs_staff_select" on public.club_subscriptions;
create policy "club_subs_staff_select" on public.club_subscriptions
  for select using (mp_club_staff(club_id) or mp_is_admin());

drop policy if exists "club_subs_admin_all" on public.club_subscriptions;
create policy "club_subs_admin_all" on public.club_subscriptions
  for all using (mp_is_admin()) with check (mp_is_admin());

-- ── Helper SQL para JOINs / triggers ────────────────────────────────────
-- Devuelve el tier efectivo del club (considera expiración).
create or replace function public.mp_club_effective_plan(p_club_id uuid)
  returns mp_club_plan
language sql stable as $$
  select case
    when c.plan_tier = 'starter' then 'starter'::mp_club_plan
    when c.plan_expires_at is null then c.plan_tier
    when c.plan_expires_at > now() then c.plan_tier
    else 'starter'::mp_club_plan
  end
  from public.clubs c
  where c.id = p_club_id;
$$;

grant execute on function public.mp_club_effective_plan(uuid) to authenticated;

-- ── Cron diario ─────────────────────────────────────────────────────────
-- Espejo de fn_process_player_plans (mig 049). Notificaciones de expiración
-- las dejamos como TODO para cuando exista el dispatcher de notifs al owner;
-- por ahora solo hacemos expire/downgrade.

create or replace function public.fn_process_club_plans()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- (a) Marca suscripciones activas vencidas como 'expired'.
  update public.club_subscriptions
     set status = 'expired',
         updated_at = now()
   where status = 'active'
     and expires_at is not null
     and expires_at < now();

  -- (b) Normaliza el plan del club cuando el plan ya venció.
  update public.clubs
     set plan_tier = 'starter',
         plan_expires_at = null
   where plan_tier <> 'starter'
     and plan_expires_at is not null
     and plan_expires_at < now();
end;
$$;

-- Programación del cron. 08:15 UTC = 15 min después del cron de player_plans
-- para evitar contención si la DB está chica.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'process-club-plans-daily') then
    perform cron.unschedule('process-club-plans-daily');
  end if;

  perform cron.schedule(
    'process-club-plans-daily',
    '15 8 * * *',
    $cron$ select public.fn_process_club_plans() $cron$
  );
end $$;
