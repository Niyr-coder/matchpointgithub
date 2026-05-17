-- 041 · profiles.onboarded_at — flag para mostrar wizard en primer login.
--
-- El wizard recoge: city, preferred_sport, skill_level. Al completarse,
-- setea onboarded_at = now() y no vuelve a aparecer.
-- Si el user lo skippea, queda null y se mostrará en próximas sesiones.
--
-- Backfill: usuarios existentes con city + preferred_sport ya seteados se
-- marcan como onboarded (cualquiera que ya configuró su perfil no necesita ver el wizard).

alter table profiles
  add column if not exists onboarded_at timestamptz;

update profiles
  set onboarded_at = updated_at
  where onboarded_at is null
    and city is not null
    and preferred_sport is not null;
