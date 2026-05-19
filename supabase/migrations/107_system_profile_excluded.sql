-- 107 · Perfil oficial MATCHPOINT: nombre uppercase, no rating, no leaderboard
-- 1) display_name -> "MATCHPOINT" (all caps, idempotente).
-- 2) Borrar player_stats / ranking_snapshots existentes del system user.
-- 3) Trigger tg_seed_player_stats ahora skipea is_system.
-- 4) RLS RESTRICTIVE en player_stats/ranking_snapshots bloquea inserts is_system.

update public.profiles
set display_name = 'MATCHPOINT'
where is_system = true;

delete from public.player_stats
where user_id in (select id from public.profiles where is_system = true);

delete from public.ranking_snapshots
where user_id in (select id from public.profiles where is_system = true);

create or replace function public.tg_seed_player_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Perfiles de sistema no tienen rating ni aparecen en leaderboards.
  if exists(select 1 from public.profiles where id = new.id and is_system = true) then
    return new;
  end if;

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

drop policy if exists player_stats_no_system_insert on public.player_stats;
create policy player_stats_no_system_insert on public.player_stats
  as restrictive
  for insert
  with check (not exists(select 1 from public.profiles p where p.id = user_id and p.is_system = true));

drop policy if exists ranking_snapshots_no_system_insert on public.ranking_snapshots;
create policy ranking_snapshots_no_system_insert on public.ranking_snapshots
  as restrictive
  for insert
  with check (not exists(select 1 from public.profiles p where p.id = user_id and p.is_system = true));
