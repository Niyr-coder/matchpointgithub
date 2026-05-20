-- 129 · Estado de activación de temas (admin toggle).
-- Los temas viven en código (PROFILE_THEMES). Esta tabla guarda SOLO overrides:
-- ausencia de fila = tema activo. Desactivar un tema inserta active=false.
-- Así, agregar un tema nuevo en código queda activo sin seed que sincronizar.
--
-- Lectura pública (el picker necesita saber qué temas ocultar). Escritura admin
-- (en la práctica via service-role en setThemeActive, con setAuditActor). Mismo
-- patrón que cosmetic_bundles.

create table if not exists public.theme_settings (
  key text primary key,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.theme_settings enable row level security;

drop policy if exists ts_public_select on public.theme_settings;
create policy ts_public_select on public.theme_settings
  for select using ( true );

drop policy if exists ts_admin_write on public.theme_settings;
create policy ts_admin_write on public.theme_settings
  for all using ( auth.jwt() ->> 'role' = 'admin' );
