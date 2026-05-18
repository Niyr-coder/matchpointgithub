-- player_stats ahora trackea rating por (sport, mode) — singles y dobles
-- son skill sets distintos (DUPR / USAP / UTPR todos lo separan).
drop materialized view if exists mv_user_ranking;

alter table player_stats add column if not exists mode mp_match_mode;
update player_stats set mode = 'singles' where mode is null;
alter table player_stats alter column mode set not null;
alter table player_stats alter column mode set default 'singles';

alter table player_stats drop constraint player_stats_pkey;
alter table player_stats add primary key (user_id, sport, mode);

create materialized view mv_user_ranking as
  select ps.user_id, ps.sport, ps.mode, ps.current_rating, ps.wins, ps.losses,
         row_number() over (partition by ps.sport, ps.mode order by ps.current_rating desc) as rank
  from player_stats ps;
create unique index on mv_user_ranking (user_id, sport, mode);

-- Función ELO mode-aware: cada match contribuye solo al rating del modo en
-- que se jugó. Antes el rating era único por sport.
create or replace function public.fn_recalculate_elo_for_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_match           matches%rowtype;
  v_winner          text;
  v_sport           mp_sport;
  v_mode            mp_match_mode;
  v_team_a          uuid[];
  v_team_b          uuid[];
  v_rating_a_avg    numeric;
  v_rating_b_avg    numeric;
  v_expected_a      numeric;
  v_expected_b      numeric;
  v_actual_a        numeric;
  v_actual_b        numeric;
  v_delta_a         int;
  v_delta_b         int;
  v_k               constant int := 32;
  v_min_rating      constant int := 100;
  v_starting_rating constant int := 2500;
  v_uid             uuid;
  v_cur             int;
  v_new             int;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then return; end if;
  if v_match.is_ranked is not true then
    update matches set rating_applied_at = now() where id = p_match_id;
    return;
  end if;
  if v_match.rating_applied_at is not null then return; end if;
  if v_match.status <> 'confirmed' then return; end if;
  if v_match.score is null then raise exception 'fn_recalculate_elo: match % sin score', p_match_id; end if;
  v_winner := v_match.score ->> 'winner';
  if v_winner is null or v_winner not in ('a', 'b') then
    raise exception 'fn_recalculate_elo: match % winner inválido', p_match_id;
  end if;
  v_sport := v_match.sport;
  v_mode  := v_match.mode;
  v_team_a := v_match.team_a_player_ids;
  v_team_b := v_match.team_b_player_ids;
  if v_team_a is null or v_team_b is null
     or array_length(v_team_a,1) is null or array_length(v_team_b,1) is null then
    raise exception 'fn_recalculate_elo: match % equipos vacíos', p_match_id;
  end if;
  foreach v_uid in array (v_team_a || v_team_b) loop
    insert into player_stats (user_id, sport, mode, current_rating, peak_rating)
    values (v_uid, v_sport, v_mode, v_starting_rating, v_starting_rating)
    on conflict (user_id, sport, mode) do nothing;
  end loop;
  select avg(ps.current_rating)::numeric into v_rating_a_avg
    from player_stats ps
   where ps.sport = v_sport and ps.mode = v_mode and ps.user_id = any (v_team_a);
  select avg(ps.current_rating)::numeric into v_rating_b_avg
    from player_stats ps
   where ps.sport = v_sport and ps.mode = v_mode and ps.user_id = any (v_team_b);
  v_expected_a := 1.0 / (1.0 + power(10.0, (v_rating_b_avg - v_rating_a_avg) / 400.0));
  v_expected_b := 1.0 - v_expected_a;
  if v_winner = 'a' then v_actual_a := 1.0; v_actual_b := 0.0;
  else v_actual_a := 0.0; v_actual_b := 1.0; end if;
  v_delta_a := round(v_k * (v_actual_a - v_expected_a))::int;
  v_delta_b := round(v_k * (v_actual_b - v_expected_b))::int;
  foreach v_uid in array v_team_a loop
    select current_rating into v_cur from player_stats
     where user_id = v_uid and sport = v_sport and mode = v_mode for update;
    v_new := greatest(v_min_rating, v_cur + v_delta_a);
    update player_stats
       set current_rating = v_new,
           peak_rating    = greatest(peak_rating, v_new),
           matches_total  = matches_total + 1,
           wins           = wins   + (case when v_winner = 'a' then 1 else 0 end),
           losses         = losses + (case when v_winner = 'b' then 1 else 0 end),
           last_match_at  = greatest(coalesce(last_match_at, v_match.played_at), v_match.played_at)
     where user_id = v_uid and sport = v_sport and mode = v_mode;
  end loop;
  foreach v_uid in array v_team_b loop
    select current_rating into v_cur from player_stats
     where user_id = v_uid and sport = v_sport and mode = v_mode for update;
    v_new := greatest(v_min_rating, v_cur + v_delta_b);
    update player_stats
       set current_rating = v_new,
           peak_rating    = greatest(peak_rating, v_new),
           matches_total  = matches_total + 1,
           wins           = wins   + (case when v_winner = 'b' then 1 else 0 end),
           losses         = losses + (case when v_winner = 'a' then 1 else 0 end),
           last_match_at  = greatest(coalesce(last_match_at, v_match.played_at), v_match.played_at)
     where user_id = v_uid and sport = v_sport and mode = v_mode;
  end loop;
  update matches set rating_applied_at = now() where id = p_match_id;
end;
$function$;
