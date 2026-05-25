-- 175 · teams.tag + teams.color (columnas referenciadas pero nunca creadas).
--
-- Pre-existing bug detectado durante MAT-70: `loadAdminTeams`
-- (src/components/dashboard/admin/AdminUserTeamsScreen.tsx) selecciona
-- `tag,color` en su query, pero ningún archivo en supabase/migrations crea
-- esas columnas. PostgREST devuelve error → el catch del loader retorna
-- teams=[], así que /dashboard/admin/admin-user-teams aparece vacío sin
-- importar cuántos equipos haya en la DB.
--
-- También está referenciado en TeamScreen.tsx (user-side) y otros lugares.
-- Ambas columnas son opcionales/decorativas: el código ya tiene fallback
-- al slug y a un color por defecto.

alter table public.teams
  add column if not exists tag text
    check (tag is null or length(tag) between 2 and 8),
  add column if not exists color text
    check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

comment on column public.teams.tag is
  'Etiqueta corta del team (2–8 chars), opcional. Si null, la UI usa slug.';
comment on column public.teams.color is
  'Color hex del team (#RRGGBB), opcional. Si null, la UI usa #10b981.';
