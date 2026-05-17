-- 051 · profiles: campos extra para el wizard de onboarding post-signup.
--
-- Verificación previa al schema (no duplicar columnas):
--  · `preferred_sport mp_sport` y `skill_level mp_skill_level` YA existen en
--    profiles desde la migration 003_identity.sql. El wizard los reutiliza:
--    `primarySport` del wizard mapea a `preferred_sport`. No se crea
--    `primary_sport` para evitar dos columnas con el mismo significado.
--  · `onboarded_at` ya fue agregado en 041; no se toca aquí.
--
-- Esta migration solo agrega `favorite_club_id`, que es nuevo.

alter table profiles
  add column if not exists favorite_club_id uuid
    references clubs(id) on delete set null;

create index if not exists idx_profiles_favorite_club
  on profiles (favorite_club_id)
  where favorite_club_id is not null;

comment on column profiles.favorite_club_id is
  'Club preferido del usuario, elegido en el wizard de onboarding. NULL = no eligió o saltó el paso.';
