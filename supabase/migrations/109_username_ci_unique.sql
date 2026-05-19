-- 109 · Username único case-insensitive + fix conflict @matchpoint
-- Bug encontrado: postgres unique en text es case-sensitive, así que
-- profiles.username = 'matchpoint' (system) y 'Matchpoint' (Tester)
-- coexistían pero ambos resuelven a "@matchpoint" para el user final.
-- Fix: rename Tester + index único en lower(username) para prevenir
-- futuros conflictos.

-- 1) Rename Tester. Su username 'Matchpoint' va a 'tester' si está libre,
-- sino 'tester_<6char_id>'.
do $$
declare
  v_tester_id uuid;
  v_new_username text;
begin
  select id into v_tester_id
  from public.profiles
  where username = 'Matchpoint' and is_system = false
  limit 1;

  if v_tester_id is null then
    return;
  end if;

  if not exists(select 1 from public.profiles where lower(username) = 'tester') then
    v_new_username := 'tester';
  else
    v_new_username := 'tester_' || substr(v_tester_id::text, 1, 6);
  end if;

  update public.profiles set username = v_new_username where id = v_tester_id;
end $$;

-- 2) Index único case-insensitive. Bloquea futuros @matchpoint variantes.
create unique index if not exists idx_profiles_username_ci
  on public.profiles (lower(username));
