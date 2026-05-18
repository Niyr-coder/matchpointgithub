-- Pagos de MatchPoint hacia clubes/partners (revenue capturado menos
-- comisión). Por ahora se insertan a mano al cerrar el período; en una
-- próxima iteración los crea un cron periódico que lee transactions
-- captured y resta take_rate_pct de platform_config.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'mp_payout_status') then
    create type mp_payout_status as enum ('pending', 'processing', 'paid', 'failed', 'cancelled');
  end if;
end$$;

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete set null,
  partner_id uuid references public.partner_orgs(id) on delete set null,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'USD',
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  status mp_payout_status not null default 'pending',
  method text,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id),
  -- Cada payout pertenece exclusivamente a un club O un partner, no ambos.
  constraint payouts_recipient_chk check (
    (club_id is not null and partner_id is null) or
    (club_id is null and partner_id is not null)
  )
);

create index if not exists idx_payouts_status_period
  on public.payouts (status, period_end desc);
create index if not exists idx_payouts_club on public.payouts (club_id) where club_id is not null;
create index if not exists idx_payouts_partner on public.payouts (partner_id) where partner_id is not null;

alter table public.payouts enable row level security;

drop policy if exists payouts_admin_all on public.payouts;
create policy payouts_admin_all on public.payouts for all
  using (mp_is_admin()) with check (mp_is_admin());

drop policy if exists payouts_club_owner_select on public.payouts;
create policy payouts_club_owner_select on public.payouts for select
  using (club_id is not null and mp_club_staff(club_id));

drop policy if exists payouts_partner_select on public.payouts;
create policy payouts_partner_select on public.payouts for select
  using (partner_id is not null and mp_is_partner_admin_of(partner_id));

comment on table public.payouts is
  'Pagos de MatchPoint a clubes/partners (su revenue menos comisión). Pendiente la creación automática vía cron; por ahora se insertan manualmente al cerrar período.';
