-- 030 · Make role-check helpers SECURITY DEFINER to avoid RLS recursion.
-- Issue: mp_is_admin() reads role_assignments, but role_assignments RLS calls
-- mp_is_admin() → infinite stack. Definer functions run with owner privileges
-- and bypass RLS, breaking the cycle.

create or replace function mp_active_role() returns text
language sql stable security definer set search_path = public as $$
  select nullif(current_setting('app.active_role', true), '')
$$;

create or replace function mp_active_club_id() returns uuid
language sql stable security definer set search_path = public as $$
  select nullif(current_setting('app.active_club_id', true), '')::uuid
$$;

create or replace function mp_has_club_access(p_club_id uuid, p_role mp_role default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from role_assignments ra
    where ra.user_id = auth.uid()
      and ra.club_id = p_club_id
      and (p_role is null or ra.role = p_role)
      and ra.revoked_at is null
  );
$$;

create or replace function mp_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from role_assignments
    where user_id = auth.uid() and role = 'admin' and revoked_at is null
  );
$$;

create or replace function mp_is_owner_of(p_club_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select mp_has_club_access(p_club_id, 'owner'::mp_role);
$$;

create or replace function mp_is_manager_of(p_club_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select mp_has_club_access(p_club_id, 'manager'::mp_role);
$$;

create or replace function mp_is_employee_of(p_club_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select mp_has_club_access(p_club_id, 'employee'::mp_role);
$$;

create or replace function mp_is_coach_in(p_club_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select mp_has_club_access(p_club_id, 'coach'::mp_role);
$$;

create or replace function mp_club_staff(p_club_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select mp_is_admin() or mp_is_owner_of(p_club_id) or mp_is_manager_of(p_club_id);
$$;

create or replace function mp_is_partner_admin_of(p_partner_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from partner_members pm
    where pm.partner_id = p_partner_id and pm.user_id = auth.uid()
      and pm.role in ('owner','admin')
  );
$$;

create or replace function mp_partner_has_club(p_club_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from partner_club_links pcl
    join partner_members pm on pm.partner_id = pcl.partner_id
    where pcl.club_id = p_club_id and pm.user_id = auth.uid()
  );
$$;
