-- Ejecutar en SQL Editor de Supabase como rol postgres (una vez por proyecto).
-- Cierra alerta rls_disabled_in_public en spatial_ref_sys (PostGIS).
-- Catálogo SRID público; no contiene datos de usuarios.

revoke all on table public.spatial_ref_sys from anon, authenticated, public;

alter table public.spatial_ref_sys enable row level security;

drop policy if exists spatial_ref_sys_public_read on public.spatial_ref_sys;
create policy spatial_ref_sys_public_read on public.spatial_ref_sys
  for select to anon, authenticated
  using (true);
