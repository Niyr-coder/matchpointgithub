-- 🐛 Causa raíz de "Database error saving new user" en signup.
-- Mig 064 cambió el PK de player_stats a (user_id, sport, mode), pero el
-- trigger tg_seed_player_stats nunca se actualizó y seguía usando
-- on conflict (user_id, sport) — constraint que ya no existe. Esto
-- abortaba toda la cadena de signup.
--
-- Trigger original (mig 028) seedeaba 1 row por sport. Ahora seedeamos 1
-- row por (sport, mode) — 6 rows totales, modelando que el ranking ELO
-- es separado por modalidad.
create or replace function public.tg_seed_player_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into player_stats (user_id, sport, mode, current_rating, peak_rating)
  values
    (new.id, 'pickleball', 'singles', 2500, 2500),
    (new.id, 'pickleball', 'doubles', 2500, 2500),
    (new.id, 'padel',      'singles', 2500, 2500),
    (new.id, 'padel',      'doubles', 2500, 2500),
    (new.id, 'tennis',     'singles', 2500, 2500),
    (new.id, 'tennis',     'doubles', 2500, 2500)
  on conflict (user_id, sport, mode) do nothing;
  return new;
end $$;
