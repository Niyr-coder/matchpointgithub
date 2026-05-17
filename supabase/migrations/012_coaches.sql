-- 012 · Coaches: profile, clubs, specialties, availability, certs, reviews.
-- See 20-database.md §9 and 30-rls.md §4.7.

create table coach_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  headline text,
  bio text,
  years_experience int,
  hourly_rate_cents int,
  currency mp_currency,
  intro_video_url text,
  verified_at timestamptz,
  verified_by uuid references profiles(id),
  rating_avg numeric(3,2),
  rating_count int not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create trigger tg_coach_profiles_updated before update on coach_profiles
  for each row execute function tg_set_updated_at();

create table coach_clubs (
  coach_id uuid not null references coach_profiles(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  active boolean not null default true,
  joined_at timestamptz default now() not null,
  primary key (coach_id, club_id)
);

create table coach_specialties (
  coach_id uuid not null references coach_profiles(id) on delete cascade,
  sport mp_sport not null,
  specialty text not null,
  proficiency int not null check (proficiency between 1 and 5),
  primary key (coach_id, sport, specialty)
);

create table coach_availability (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_profiles(id) on delete cascade,
  club_id uuid references clubs(id),
  day_of_week int not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (ends_at > starts_at)
);

create table coach_certifications (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_profiles(id) on delete cascade,
  name text not null,
  issuer text,
  issued_year int,
  document_url text,
  verified_at timestamptz
);

create table coach_reviews (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_profiles(id) on delete cascade,
  reviewer_id uuid not null references profiles(id),
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now() not null,
  unique (coach_id, reviewer_id)
);

-- RLS
alter table coach_profiles enable row level security;
create policy coach_public_select on coach_profiles for select using (true);
create policy coach_self_write on coach_profiles for all
  using (id = auth.uid()) with check (id = auth.uid());
create policy coach_admin_all on coach_profiles for all using (mp_is_admin());

alter table coach_clubs enable row level security;
create policy cc_public_select on coach_clubs for select using (true);
create policy cc_coach_write on coach_clubs for all using (coach_id = auth.uid());
create policy cc_staff_write on coach_clubs for all using (mp_club_staff(club_id));

alter table coach_specialties enable row level security;
create policy cs_public_select on coach_specialties for select using (true);
create policy cs_coach_write on coach_specialties for all using (coach_id = auth.uid());

alter table coach_availability enable row level security;
create policy cav_public_select on coach_availability for select using (true);
create policy cav_coach_write on coach_availability for all using (coach_id = auth.uid());

alter table coach_certifications enable row level security;
create policy ccert_public_select on coach_certifications for select using (true);
create policy ccert_coach_write on coach_certifications for all using (coach_id = auth.uid());
create policy ccert_admin_verify on coach_certifications for update using (mp_is_admin());

alter table coach_reviews enable row level security;
create policy crv_public_select on coach_reviews for select using (true);
create policy crv_self_write on coach_reviews for insert with check (reviewer_id = auth.uid());
create policy crv_self_update on coach_reviews for update using (reviewer_id = auth.uid());
create policy crv_self_delete on coach_reviews for delete using (reviewer_id = auth.uid());
