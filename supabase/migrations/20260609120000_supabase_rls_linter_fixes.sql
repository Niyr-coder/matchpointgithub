-- Cierra alertas Supabase `rls_disabled_in_public` (correo Security Advisor).
-- Ver: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

-- 1) Tabla interna creada por scripts/apply-migrations-staging.ts (tracking de SQL).
--    No debe ser legible vía anon/authenticated; solo conexión directa / service role.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = '_matchpoint_migrations'
      and c.relkind = 'r'
  ) then
    alter table public._matchpoint_migrations enable row level security;
    revoke all on table public._matchpoint_migrations from anon, authenticated, public;
  end if;
end $$;

-- 2) PostGIS: spatial_ref_sys la posee supabase_admin — no se puede ALTER desde migraciones
--    estándar. Ejecutar manualmente en SQL Editor (rol postgres) si el advisor persiste:
--      revoke all on table public.spatial_ref_sys from anon, authenticated, public;
--    Referencia: https://github.com/supabase/supabase/issues/29122
--    Riesgo real: catálogo SRID público, no datos de usuarios.
