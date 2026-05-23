-- 159 · Términos de asignación de rol (RBAC Stage 2). Antes de que un OWNER
-- asigne un rol de club a una persona, debe aceptar términos vigentes; se
-- registra la versión aceptada en role_assignments.terms_version. El texto y la
-- versión viven en platform_config (editables). El grant queda en el audit log.
alter table role_assignments add column if not exists terms_version text;

insert into platform_config (key, value, description) values
  ('role_grant_terms',
   '"Al asignar un rol de club le das a esta persona acceso a datos y operaciones del club según el rol (reservas, clientes, caja, finanzas o configuración). Eres responsable del uso que haga mientras tenga el rol. Puedes revocarlo en cualquier momento."'::jsonb,
   'Términos que el owner acepta antes de asignar un rol de club.'),
  ('role_grant_terms_version', '"2026-05-v1"'::jsonb, 'Versión vigente de los términos de asignación de rol.')
on conflict (key) do nothing;
