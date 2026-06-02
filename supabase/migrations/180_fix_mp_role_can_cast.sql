-- 180 · RBAC helper: castear RoleKey al comparar contra role_capabilities.
-- Algunas DB tienen role_capabilities.role como text; role_assignments.role es
-- mp_role. El cast evita "operator does not exist: text = mp_role" al asignar
-- staff desde owner.

create or replace function public.mp_role_can(_uid uuid, _cap text, _club uuid default null)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r record; _lvl text;
begin
  if _uid is null then return false; end if;
  if exists (
    select 1
    from role_assignments
    where user_id = _uid and role = 'admin' and revoked_at is null
  ) then
    return true;
  end if;

  for r in
    select distinct role, club_id
    from role_assignments
    where user_id = _uid and revoked_at is null
  loop
    select level into _lvl
    from role_capabilities
    where role = r.role::text and cap_key = _cap;

    if _lvl is null then _lvl := 'none'; end if;
    if _lvl in ('all', 'public', 'limited') then
      return true;
    elsif _lvl = 'own' then
      if _club is null or r.club_id = _club then return true; end if;
    end if;
  end loop;
  return false;
end $$;

grant execute on function public.mp_role_can(uuid, text, uuid) to authenticated;
