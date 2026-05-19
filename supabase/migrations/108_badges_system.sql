-- 108 · Sistema de insignias funcional
-- Reemplaza const BADGES hardcoded en UserHomeView.
-- Catálogo + unlocks por user + auto-unlock via triggers en player_stats y friendships.

-- 1) Catálogo de badges
create table if not exists public.badges (
  kind text primary key,
  label text not null,
  description text,
  icon text not null,
  category text not null default 'general'
    check (category in ('general','tournament','social','ranking','milestone')),
  criteria_kind text not null
    check (criteria_kind in ('matches_total','wins_total','win_streak','top_rank','tournaments_won','manual','friends_count')),
  criteria_value int not null default 1,
  criteria_sport mp_sport,
  sort_order int not null default 0,
  active bool not null default true,
  created_at timestamptz not null default now()
);

alter table public.badges enable row level security;
drop policy if exists badges_public_read on public.badges;
create policy badges_public_read on public.badges for select using (true);
drop policy if exists badges_admin_write on public.badges;
create policy badges_admin_write on public.badges for all using (mp_is_admin());

-- 2) Tabla de unlocks por user
create table if not exists public.player_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_kind text not null references public.badges(kind),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, badge_kind)
);

create index if not exists idx_player_badges_user on public.player_badges(user_id);

alter table public.player_badges enable row level security;
drop policy if exists pb_self_read on public.player_badges;
create policy pb_self_read on public.player_badges for select using (user_id = auth.uid());
drop policy if exists pb_public_read on public.player_badges;
create policy pb_public_read on public.player_badges for select using (true);
drop policy if exists pb_admin_write on public.player_badges;
create policy pb_admin_write on public.player_badges for all using (mp_is_admin());

-- 3) Seed inicial
insert into public.badges (kind, label, description, icon, category, criteria_kind, criteria_value, sort_order) values
  ('first_match',    'Primera partida', 'Jugaste tu primer match oficial.',                  'flag',   'milestone',  'matches_total', 1,   10),
  ('win_streak_5',   'Racha 5',         'Cinco victorias consecutivas.',                     'flame',  'milestone',  'win_streak',    5,   20),
  ('top_50',         'Top 50',          'Llegaste al top 50 del ranking nacional.',          'trophy', 'ranking',    'top_rank',      50,  30),
  ('top_10',         'Top 10',          'Llegaste al top 10 del ranking nacional.',          'medal',  'ranking',    'top_rank',      10,  40),
  ('doblete',        'Doblete',         'Ganaste 2 torneos en un mismo año.',                'award',  'tournament', 'tournaments_won', 2, 50),
  ('campeon',        'Campeón',         'Ganaste 5 torneos en total.',                      'crown',  'tournament', 'tournaments_won', 5, 60),
  ('matches_10',     'Veterano',        'Jugaste 10 partidos oficiales.',                    'shield', 'milestone',  'matches_total', 10,  15),
  ('matches_50',     'Habitué',         'Jugaste 50 partidos oficiales.',                    'star',   'milestone',  'matches_total', 50,  25),
  ('wins_10',        '10 victorias',    'Acumulaste 10 victorias.',                          'check',  'milestone',  'wins_total',    10,  35),
  ('friends_5',      'Conectado',       'Hiciste 5 amigos en MatchPoint.',                  'users',  'social',     'friends_count', 5,   70)
on conflict (kind) do nothing;

-- 4) Trigger: chequear unlocks cuando player_stats cambia
create or replace function fn_check_badge_unlocks_on_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_badge record;
  v_value int;
  v_user_is_system bool;
begin
  select is_system into v_user_is_system from profiles where id = new.user_id;
  if v_user_is_system = true then return new; end if;

  if new.matches_total = old.matches_total and new.wins = old.wins then
    return new;
  end if;

  for v_badge in
    select kind, criteria_kind, criteria_value, criteria_sport
    from badges
    where active = true
      and criteria_kind in ('matches_total','wins_total')
      and (criteria_sport is null or criteria_sport = new.sport)
  loop
    if exists(select 1 from player_badges where user_id = new.user_id and badge_kind = v_badge.kind) then
      continue;
    end if;

    if v_badge.criteria_kind = 'matches_total' then
      select coalesce(sum(matches_total), 0)::int into v_value
      from player_stats
      where user_id = new.user_id
        and (v_badge.criteria_sport is null or sport = v_badge.criteria_sport);
    elsif v_badge.criteria_kind = 'wins_total' then
      select coalesce(sum(wins), 0)::int into v_value
      from player_stats
      where user_id = new.user_id
        and (v_badge.criteria_sport is null or sport = v_badge.criteria_sport);
    else
      v_value := 0;
    end if;

    if v_value >= v_badge.criteria_value then
      insert into player_badges (user_id, badge_kind) values (new.user_id, v_badge.kind)
      on conflict do nothing;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists tg_badges_check_on_stats on public.player_stats;
create trigger tg_badges_check_on_stats
  after update on public.player_stats
  for each row execute function fn_check_badge_unlocks_on_stats();

-- 5) Trigger amigos: friends_count badges al aceptar friendship
create or replace function fn_check_badge_unlocks_on_friendship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_badge record;
  v_count int;
  v_user_a_system bool;
  v_user_b_system bool;
begin
  select is_system into v_user_a_system from profiles where id = new.user_a;
  select is_system into v_user_b_system from profiles where id = new.user_b;

  for v_badge in
    select kind, criteria_value from badges
    where active = true and criteria_kind = 'friends_count'
  loop
    if v_user_a_system is not true then
      select count(*) into v_count from friendships where user_a = new.user_a or user_b = new.user_a;
      if v_count >= v_badge.criteria_value then
        insert into player_badges (user_id, badge_kind) values (new.user_a, v_badge.kind)
        on conflict do nothing;
      end if;
    end if;
    if v_user_b_system is not true then
      select count(*) into v_count from friendships where user_a = new.user_b or user_b = new.user_b;
      if v_count >= v_badge.criteria_value then
        insert into player_badges (user_id, badge_kind) values (new.user_b, v_badge.kind)
        on conflict do nothing;
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists tg_badges_check_on_friendship on public.friendships;
create trigger tg_badges_check_on_friendship
  after insert on public.friendships
  for each row execute function fn_check_badge_unlocks_on_friendship();
