-- 006 · Courts: bookable physical assets per club.
-- See docs/architecture/20-database.md §4 and 30-rls.md §4.3.

create table courts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  code text not null,
  name text,
  sport mp_sport not null,
  surface text,
  indoor boolean not null default false,
  lights boolean not null default true,
  active boolean not null default true,
  ordinal int not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (club_id, code)
);

create index idx_courts_club on courts (club_id);

create trigger tg_courts_updated before update on courts
  for each row execute function tg_set_updated_at();

-- ── court_pricing ──────────────────────────────────────────────────────
create table court_pricing (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts(id) on delete cascade,
  day_of_week int check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  price_cents int not null,
  duration_minutes int not null default 60,
  currency mp_currency not null,
  active boolean not null default true,
  check (ends_at > starts_at)
);
create index idx_court_pricing_court on court_pricing (court_id);

-- ── court_blocks (no-overlap per court) ────────────────────────────────
create table court_blocks (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts(id) on delete cascade,
  reason text not null,
  during tstzrange not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now() not null,
  exclude using gist (court_id with =, during with &&)
);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table courts enable row level security;
create policy courts_public_select on courts for select using (true);
create policy courts_staff_write on courts for all
  using (mp_club_staff(club_id))
  with check (mp_club_staff(club_id));

alter table court_pricing enable row level security;
create policy cp_public_select on court_pricing for select using (true);
create policy cp_staff_write on court_pricing for all
  using (exists(select 1 from courts c where c.id = court_id and mp_club_staff(c.club_id)));

alter table court_blocks enable row level security;
create policy cb_public_select on court_blocks for select using (true);
create policy cb_staff_write on court_blocks for all
  using (exists(select 1 from courts c where c.id = court_id and mp_club_staff(c.club_id)));
