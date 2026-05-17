-- 003 · Identity: profiles, role_assignments, role_requests, sessions.
-- See docs/architecture/20-database.md §2 and 30-rls.md §4.1.

-- ── profiles (1:1 with auth.users) ──────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (length(username) between 3 and 24),
  display_name text not null,
  avatar_url text,
  bio text,
  country text,
  city text,
  birthdate date,
  preferred_sport mp_sport,
  skill_level mp_skill_level,
  phone text,
  phone_verified_at timestamptz,
  locale text default 'es' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_profiles_username_trgm on profiles using gin (username gin_trgm_ops);
create index idx_profiles_display_trgm on profiles using gin (display_name gin_trgm_ops);

create trigger tg_profiles_updated before update on profiles
  for each row execute function tg_set_updated_at();

-- Auto-create profile row on signup. Email + display_name come from
-- raw_user_meta_data passed by signUp() server action.
create or replace function tg_handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username',
             'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'locale', 'es')
  )
  on conflict (id) do nothing;

  -- Every new user starts with a 'user' role assignment (global scope).
  insert into public.role_assignments (user_id, role)
  values (new.id, 'user')
  on conflict do nothing;

  return new;
end $$;

-- Trigger created after role_assignments below.

-- ── role_assignments ────────────────────────────────────────────────────
-- Forward declaration: clubs and partner_orgs are created later. Use a
-- deferrable check via partial FK creation in 004_clubs.sql for club_id and
-- in a future partners migration for partner_id. For now: plain uuid columns.
create table role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role mp_role not null,
  club_id uuid,
  partner_id uuid,
  granted_by uuid references profiles(id),
  granted_at timestamptz default now() not null,
  revoked_at timestamptz,
  notes text,
  unique (user_id, role, club_id, partner_id)
);

create index idx_role_assignments_user on role_assignments (user_id) where revoked_at is null;
create index idx_role_assignments_club on role_assignments (club_id) where revoked_at is null;
create index idx_role_assignments_partner on role_assignments (partner_id) where revoked_at is null;

-- Now wire the trigger that creates profile + initial role.
create trigger tg_auth_user_created
  after insert on auth.users
  for each row execute function tg_handle_new_auth_user();

-- ── role_requests ───────────────────────────────────────────────────────
create table role_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  requested_role mp_role not null,
  target_club_id uuid,
  reason text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','withdrawn')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  reviewer_notes text,
  created_at timestamptz default now() not null
);

-- ── sessions (UI-visible list, optional) ────────────────────────────────
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  ua text,
  ip inet,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now() not null
);

-- ── Helpers that depend on role_assignments ─────────────────────────────
create or replace function mp_has_club_access(p_club_id uuid, p_role mp_role default null)
returns boolean language sql stable as $$
  select exists(
    select 1 from role_assignments ra
    where ra.user_id = auth.uid()
      and ra.club_id = p_club_id
      and (p_role is null or ra.role = p_role)
      and ra.revoked_at is null
  );
$$;

create or replace function mp_is_admin() returns boolean
language sql stable as $$
  select exists(
    select 1 from role_assignments
    where user_id = auth.uid() and role = 'admin' and revoked_at is null
  );
$$;

create or replace function mp_is_owner_of(p_club_id uuid) returns boolean
language sql stable as $$
  select mp_has_club_access(p_club_id, 'owner');
$$;

create or replace function mp_is_manager_of(p_club_id uuid) returns boolean
language sql stable as $$
  select mp_has_club_access(p_club_id, 'manager');
$$;

create or replace function mp_is_employee_of(p_club_id uuid) returns boolean
language sql stable as $$
  select mp_has_club_access(p_club_id, 'employee');
$$;

create or replace function mp_is_coach_in(p_club_id uuid) returns boolean
language sql stable as $$
  select mp_has_club_access(p_club_id, 'coach');
$$;

create or replace function mp_club_staff(p_club_id uuid) returns boolean
language sql stable as $$
  select mp_is_admin()
      or mp_is_owner_of(p_club_id)
      or mp_is_manager_of(p_club_id);
$$;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table profiles enable row level security;

create policy profiles_self on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_admin on profiles for all
  using (mp_is_admin());

create policy profiles_authn_select_limited on profiles for select
  using (auth.uid() is not null);

-- Public-facing view (safe columns only).
create view v_public_profiles as
  select id, username, display_name, avatar_url, city, country,
         preferred_sport, skill_level, created_at
  from profiles;
grant select on v_public_profiles to anon, authenticated;

alter table role_assignments enable row level security;

create policy ra_self_select on role_assignments for select
  using (user_id = auth.uid());

create policy ra_admin_all on role_assignments for all
  using (mp_is_admin());

create policy ra_owner_select_club on role_assignments for select
  using (club_id is not null and mp_is_owner_of(club_id));

create policy ra_owner_grant_staff on role_assignments for insert
  with check (
    club_id is not null and mp_is_owner_of(club_id)
    and role in ('manager','coach','employee')
  );

create policy ra_owner_revoke_staff on role_assignments for update
  using (
    club_id is not null and mp_is_owner_of(club_id)
    and role in ('manager','coach','employee')
  );

alter table role_requests enable row level security;

create policy rr_self_all on role_requests for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy rr_admin_all on role_requests for all using (mp_is_admin());

alter table sessions enable row level security;
create policy sessions_self on sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
