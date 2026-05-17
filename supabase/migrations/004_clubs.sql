-- 004 · Clubs domain (post-approval entities; applications live in 005).
-- See docs/architecture/20-database.md §3 and 30-rls.md §4.2.

create extension if not exists "postgis";

create table clubs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  logo_url text,
  cover_url text,
  country text not null,
  city text not null,
  address text,
  geo geography(point),
  phone text,
  email text,
  timezone text not null default 'UTC',
  currency mp_currency not null default 'USD',
  sports mp_sport[] not null default '{}',
  status text not null default 'active'
    check (status in ('pending','active','suspended','archived')),
  applied_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_clubs_geo on clubs using gist (geo);
create index idx_clubs_name_trgm on clubs using gin (name gin_trgm_ops);
create index idx_clubs_status on clubs (status);

create trigger tg_clubs_updated before update on clubs
  for each row execute function tg_set_updated_at();

-- Now we can add the deferred FK from role_assignments.club_id → clubs.id.
alter table role_assignments
  add constraint role_assignments_club_fk
  foreign key (club_id) references clubs(id) on delete cascade;

-- ── club_settings ───────────────────────────────────────────────────────
create table club_settings (
  club_id uuid primary key references clubs(id) on delete cascade,
  reservation_window_days int not null default 14,
  cancellation_window_hours int not null default 4,
  default_slot_minutes int not null default 60,
  allow_walkins boolean not null default true,
  charge_no_show_pct int not null default 50,
  open_hours jsonb not null default '{}',
  updated_at timestamptz default now() not null
);

create trigger tg_club_settings_updated before update on club_settings
  for each row execute function tg_set_updated_at();

-- ── club_amenities ──────────────────────────────────────────────────────
create table club_amenities (
  club_id uuid not null references clubs(id) on delete cascade,
  amenity text not null,
  primary key (club_id, amenity)
);

-- ── club_photos ─────────────────────────────────────────────────────────
create table club_photos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  url text not null,
  caption text,
  ordinal int not null default 0,
  created_at timestamptz default now() not null
);
create index idx_club_photos_club on club_photos (club_id, ordinal);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table clubs enable row level security;
create policy clubs_public_select on clubs for select using (status = 'active');
create policy clubs_staff_select on clubs for select using (mp_club_staff(id));
create policy clubs_admin_all on clubs for all using (mp_is_admin());
create policy clubs_owner_update on clubs for update
  using (mp_is_owner_of(id)) with check (mp_is_owner_of(id));

alter table club_settings enable row level security;
create policy club_settings_public_select on club_settings for select using (
  exists(select 1 from clubs c where c.id = club_id and c.status = 'active')
);
create policy club_settings_staff_all on club_settings for all
  using (mp_club_staff(club_id));

alter table club_amenities enable row level security;
create policy club_amenities_public_select on club_amenities for select using (true);
create policy club_amenities_staff_write on club_amenities for all
  using (mp_club_staff(club_id));

alter table club_photos enable row level security;
create policy club_photos_public_select on club_photos for select using (true);
create policy club_photos_staff_write on club_photos for all
  using (mp_club_staff(club_id));
