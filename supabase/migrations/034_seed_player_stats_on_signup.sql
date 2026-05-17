-- 034 · Auto-seed player_stats con rating inicial 2500 (MP Rating 2.5) al crear profile.
-- Backfill incluido para profiles existentes sin stats.

create or replace function tg_seed_player_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into player_stats (user_id, sport, current_rating, peak_rating)
  values
    (new.id, 'pickleball', 2500, 2500),
    (new.id, 'padel',       2500, 2500),
    (new.id, 'tennis',      2500, 2500)
  on conflict (user_id, sport) do nothing;
  return new;
end $$;

drop trigger if exists tg_profiles_seed_stats on profiles;
create trigger tg_profiles_seed_stats
  after insert on profiles
  for each row execute function tg_seed_player_stats();

-- Backfill: profiles existentes sin player_stats reciben el seed.
insert into player_stats (user_id, sport, current_rating, peak_rating)
select p.id, s.sport, 2500, 2500
from profiles p
cross join (values ('pickleball'::mp_sport), ('padel'::mp_sport), ('tennis'::mp_sport)) s(sport)
on conflict (user_id, sport) do nothing;
