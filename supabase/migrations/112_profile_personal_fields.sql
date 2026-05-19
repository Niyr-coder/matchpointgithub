-- 112 · Campos personales para onboarding refactor.
-- Agrega first_name, last_name y dominant_hand a profiles. El onboarding
-- wizard ahora pide estos (en vez de sport/skill/favorite_club que pasaron
-- a ser opcionales y editables desde el perfil).
--
-- display_name se mantiene NOT NULL y se sigue derivando de first + ' ' + last
-- al guardar desde server actions.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mp_dominant_hand') then
    create type public.mp_dominant_hand as enum ('left', 'right');
  end if;
end $$;

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists dominant_hand public.mp_dominant_hand;
