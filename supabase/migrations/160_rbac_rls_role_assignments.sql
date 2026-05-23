-- 160 · RBAC Stage 3 (RLS, inicio): defensa en profundidad sobre el flujo
-- owner→staff. Las políticas de role_assignments que dejan a un OWNER otorgar/
-- revocar staff de su club ahora exigen ADEMÁS la capacidad `sys.roles` (vía
-- mp_role_can). Patrón ADITIVO: sólo puede RESTRINGIR (si admin apaga
-- owner.sys.roles en la matriz, el owner pierde el insert/update incluso por
-- API directa); NUNCA amplía (sigue exigiendo ser owner del club + rol staff).
-- El admin no se ve afectado (usa la política separada ra_admin_all).
-- Behavior-preserving en defaults: owner.sys.roles está seeded en 'own' (mig
-- 158) → mp_role_can devuelve true para su club, igual que antes.
-- mp_role_can es SECURITY DEFINER (corre como owner con BYPASSRLS, como
-- mp_is_owner_of) → sin recursión al consultar role_assignments.

drop policy if exists ra_owner_grant_staff on role_assignments;
create policy ra_owner_grant_staff on role_assignments for insert
  with check (
    club_id is not null and mp_is_owner_of(club_id)
    and role in ('manager', 'coach', 'employee')
    and mp_role_can(auth.uid(), 'sys.roles', club_id)
  );

drop policy if exists ra_owner_revoke_staff on role_assignments;
create policy ra_owner_revoke_staff on role_assignments for update
  using (
    club_id is not null and mp_is_owner_of(club_id)
    and role in ('manager', 'coach', 'employee')
    and mp_role_can(auth.uid(), 'sys.roles', club_id)
  );
