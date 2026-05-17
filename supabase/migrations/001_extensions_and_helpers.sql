-- 001 · Extensions and reusable helpers
-- See docs/architecture/20-database.md §0 and 30-rls.md §1.

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "btree_gist";
create extension if not exists "unaccent";

-- ── updated_at trigger ──────────────────────────────────────────────────
create or replace function tg_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Active role / club helpers ──────────────────────────────────────────
-- Set by the proxy / Server Actions via:
--   select set_config('app.active_role', 'owner', true);
--   select set_config('app.active_club_id', 'uuid...', true);

create or replace function mp_active_role() returns text
language sql stable as $$
  select nullif(current_setting('app.active_role', true), '')
$$;

create or replace function mp_active_club_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.active_club_id', true), '')::uuid
$$;

-- has_club_access / is_admin / is_owner_of / is_manager_of / is_employee_of
-- / is_coach_in / club_staff are defined in 003_identity.sql once role_assignments exists.
