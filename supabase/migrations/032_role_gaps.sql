-- 032_role_gaps.sql
-- Adds missing tables/columns detected while wiring role-specific UI:
--   - payouts (Stripe Connect-ready payouts to clubs/partners/coaches)
--   - shifts (employee/coach scheduling with exclusion constraint)
--   - club_reviews (NPS / member reviews)
--   - extra columns on coach_clubs, coach_profiles, walkins

------------------------------------------------------------------------------
-- 1. payouts
------------------------------------------------------------------------------
create table payouts (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('club','partner','coach')),
  club_id uuid references clubs(id),
  partner_id uuid references partner_orgs(id),
  coach_id uuid references profiles(id),
  period_start date not null,
  period_end date not null,
  gross_cents int not null,
  commission_cents int not null,
  net_cents int not null,
  currency mp_currency not null default 'USD',
  status text not null default 'pending' check (status in ('pending','approved','processing','paid','failed','cancelled')),
  provider text,
  provider_payout_id text,
  scheduled_for timestamptz,
  paid_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  check (
    (scope='club' and club_id is not null and partner_id is null and coach_id is null) or
    (scope='partner' and partner_id is not null and club_id is null and coach_id is null) or
    (scope='coach' and coach_id is not null and club_id is null and partner_id is null)
  )
);
create index idx_payouts_club on payouts (club_id, period_end desc) where club_id is not null;
create index idx_payouts_partner on payouts (partner_id, period_end desc) where partner_id is not null;
create index idx_payouts_coach on payouts (coach_id, period_end desc) where coach_id is not null;
create index idx_payouts_status on payouts (status);
create trigger tg_payouts_updated before update on payouts for each row execute function tg_set_updated_at();

alter table payouts enable row level security;
create policy po_admin_all on payouts for all using (mp_is_admin());
create policy po_club_select on payouts for select using (club_id is not null and mp_club_staff(club_id));
create policy po_partner_select on payouts for select using (
  partner_id is not null and exists(
    select 1 from partner_members where partner_id = payouts.partner_id
      and user_id = auth.uid() and role in ('owner','admin')
  )
);
create policy po_coach_select on payouts for select using (coach_id = auth.uid());

------------------------------------------------------------------------------
-- 2. shifts
------------------------------------------------------------------------------
create table shifts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  user_id uuid not null references profiles(id),
  role mp_role not null check (role in ('employee','manager','coach')),
  during tstzrange not null,
  status text not null default 'scheduled' check (status in ('scheduled','active','completed','cancelled','no_show')),
  clocked_in_at timestamptz,
  clocked_out_at timestamptz,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  exclude using gist (user_id with =, during with &&)
);
create index idx_shifts_club_during on shifts using gist (club_id, during);
create index idx_shifts_user on shifts (user_id, during);
create trigger tg_shifts_updated before update on shifts for each row execute function tg_set_updated_at();

alter table shifts enable row level security;
create policy sh_self on shifts for select using (user_id = auth.uid());
create policy sh_club_staff on shifts for all using (mp_club_staff(club_id));

------------------------------------------------------------------------------
-- 3. club_reviews
------------------------------------------------------------------------------
create table club_reviews (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  nps smallint check (nps between 0 and 10),
  comment text,
  reservation_id uuid references reservations(id),
  created_at timestamptz default now() not null,
  unique (club_id, user_id, reservation_id)
);
create index idx_club_reviews_club on club_reviews (club_id, created_at desc);

alter table club_reviews enable row level security;
create policy crv_public_select on club_reviews for select using (true);
create policy crv_self_write on club_reviews for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy crv_staff_select on club_reviews for select using (mp_club_staff(club_id));

------------------------------------------------------------------------------
-- 4. New columns
------------------------------------------------------------------------------
alter table coach_clubs add column if not exists commission_pct numeric(5,4) not null default 0.2000;
alter table coach_profiles add column if not exists primary_sport mp_sport;
alter table walkins add column if not exists notes text;
alter table walkins add column if not exists sport mp_sport;
