-- 161 · Conteo de miembros por rol vía agregado, para que admin-roles NO tenga
-- que traer TODAS las filas de role_assignments (el rol 'user' tiene una por
-- usuario → miles). Los miembros se paginan aparte (listRoleMembers).
create or replace function fn_role_member_counts()
returns table(role text, n bigint)
language sql stable security definer set search_path = public as $$
  select role::text, count(distinct user_id)
  from role_assignments
  where revoked_at is null
  group by role;
$$;

grant execute on function fn_role_member_counts() to authenticated;
