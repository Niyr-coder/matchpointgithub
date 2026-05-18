-- Acuerdo de comisión coach-club. Cada coach puede negociar % distinto
-- con cada club. Si no hay row para (coach, club) → fallback default 20%.
create table if not exists public.coach_commissions (
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  commission_pct numeric(5,2) not null check (commission_pct >= 0 and commission_pct <= 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (coach_id, club_id)
);

alter table public.coach_commissions enable row level security;

drop policy if exists cc_self_read on public.coach_commissions;
create policy cc_self_read on public.coach_commissions for select
  using (coach_id = auth.uid() or mp_club_staff(club_id) or mp_is_admin());

drop policy if exists cc_admin_all on public.coach_commissions;
create policy cc_admin_all on public.coach_commissions for all
  using (mp_is_admin()) with check (mp_is_admin());

comment on table public.coach_commissions is
  'Comisión (%) que retiene el club sobre cada clase del coach. Sin row = default 20% configurable vía platform_config en el futuro.';
