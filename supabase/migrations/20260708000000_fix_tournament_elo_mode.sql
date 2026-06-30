-- 20260708000000 · Fix ELO de partidos de torneo: conflict target y modo.
--
-- mig 064 cambió el PK de player_stats a (user_id, sport, mode).
-- mig 20260702200000 usa el PK viejo (user_id, sport) en los on conflict →
-- las funciones fallan silenciosamente al intentar hacer upsert.
--
-- Este fix reescribe ambas funciones para:
--   1. Insertar con modo inferido (1 jugador = 'singles', 2+ = 'doubles').
--   2. Usar on conflict (user_id, sport, mode).
--   3. Filtrar player_stats por mode en las queries de rating promedio y update.

-- ---------------------------------------------------------------------------
-- fn_recalculate_elo_for_bracket_match (fix)
-- ---------------------------------------------------------------------------
create or replace function fn_recalculate_elo_for_bracket_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sport           mp_sport;
  v_mode            mp_match_mode;
  v_winner          char(1);
  v_team_a          uuid[];
  v_team_b          uuid[];
  v_side_a_reg_id   uuid;
  v_side_b_reg_id   uuid;
  v_bracket_id      uuid;
  v_rating_applied  timestamptz;
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
  select bracket_id, side_a_registration_id, side_b_registration_id,
         winner_side, rating_applied_at
    into v_bracket_id, v_side_a_reg_id, v_side_b_reg_id,
         v_winner, v_rating_applied
    from bracket_matches
   where id = p_match_id;

  if not found then
    raise notice 'fn_recalculate_elo_for_bracket_match: match % no encontrado', p_match_id;
    return;
  end if;

  if v_rating_applied is not null then return; end if;
  if v_winner is null or v_winner not in ('a', 'b') then return; end if;
  if v_side_a_reg_id is null or v_side_b_reg_id is null then return; end if;

  select t.sport
    into v_sport
    from brackets b
    join tournaments t on t.id = b.tournament_id
   where b.id = v_bracket_id;

  if v_sport is null then return; end if;

  select player_ids into v_team_a from registrations where id = v_side_a_reg_id;
  select player_ids into v_team_b from registrations where id = v_side_b_reg_id;

  if v_team_a is null or v_team_b is null
     or array_length(v_team_a, 1) is null
     or array_length(v_team_b, 1) is null then
    return;
  end if;

  -- Inferir modo: 1 jugador por equipo → singles, 2+ → doubles
  v_mode := case when array_length(v_team_a, 1) = 1
                 then 'singles'::mp_match_mode
                 else 'doubles'::mp_match_mode
            end;

  foreach v_uid in array (v_team_a || v_team_b) loop
    insert into player_stats (user_id, sport, mode, current_rating, peak_rating)
    values (v_uid, v_sport, v_mode, v_starting_rating, v_starting_rating)
    on conflict (user_id, sport, mode) do nothing;
  end loop;

  select avg(ps.current_rating)::numeric
    into v_rating_a_avg
    from player_stats ps
   where ps.sport = v_sport and ps.mode = v_mode and ps.user_id = any (v_team_a);

  select avg(ps.current_rating)::numeric
    into v_rating_b_avg
    from player_stats ps
   where ps.sport = v_sport and ps.mode = v_mode and ps.user_id = any (v_team_b);

  v_expected_a := 1.0 / (1.0 + power(10.0, (v_rating_b_avg - v_rating_a_avg) / 400.0));
  v_expected_b := 1.0 - v_expected_a;

  if v_winner = 'a' then
    v_actual_a := 1.0; v_actual_b := 0.0;
  else
    v_actual_a := 0.0; v_actual_b := 1.0;
  end if;

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
           last_match_at  = greatest(coalesce(last_match_at, now()), now())
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
           last_match_at  = greatest(coalesce(last_match_at, now()), now())
     where user_id = v_uid and sport = v_sport and mode = v_mode;
  end loop;

  update bracket_matches
     set rating_applied_at = now()
   where id = p_match_id;
end;
$$;

comment on function fn_recalculate_elo_for_bracket_match(uuid) is
  'ELO (K=32) para bracket_match. Mode inferido del tamaño del equipo. Idempotente via rating_applied_at.';

-- ---------------------------------------------------------------------------
-- fn_recalculate_elo_for_group_match (fix)
-- ---------------------------------------------------------------------------
create or replace function fn_recalculate_elo_for_group_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sport           mp_sport;
  v_mode            mp_match_mode;
  v_winner          char(1);
  v_team_a          uuid[];
  v_team_b          uuid[];
  v_side_a_reg_id   uuid;
  v_side_b_reg_id   uuid;
  v_group_id        uuid;
  v_rating_applied  timestamptz;
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
  select group_id, side_a_registration_id, side_b_registration_id,
         winner_side, rating_applied_at
    into v_group_id, v_side_a_reg_id, v_side_b_reg_id,
         v_winner, v_rating_applied
    from tournament_group_matches
   where id = p_match_id;

  if not found then
    raise notice 'fn_recalculate_elo_for_group_match: match % no encontrado', p_match_id;
    return;
  end if;

  if v_rating_applied is not null then return; end if;
  if v_winner is null or v_winner not in ('a', 'b') then return; end if;

  select t.sport
    into v_sport
    from tournament_groups tg
    join tournament_categories tc on tc.id = tg.category_id
    join tournaments t on t.id = tc.tournament_id
   where tg.id = v_group_id;

  if v_sport is null then return; end if;

  select player_ids into v_team_a from registrations where id = v_side_a_reg_id;
  select player_ids into v_team_b from registrations where id = v_side_b_reg_id;

  if v_team_a is null or v_team_b is null
     or array_length(v_team_a, 1) is null
     or array_length(v_team_b, 1) is null then
    return;
  end if;

  -- Inferir modo: 1 jugador por equipo → singles, 2+ → doubles
  v_mode := case when array_length(v_team_a, 1) = 1
                 then 'singles'::mp_match_mode
                 else 'doubles'::mp_match_mode
            end;

  foreach v_uid in array (v_team_a || v_team_b) loop
    insert into player_stats (user_id, sport, mode, current_rating, peak_rating)
    values (v_uid, v_sport, v_mode, v_starting_rating, v_starting_rating)
    on conflict (user_id, sport, mode) do nothing;
  end loop;

  select avg(ps.current_rating)::numeric
    into v_rating_a_avg
    from player_stats ps
   where ps.sport = v_sport and ps.mode = v_mode and ps.user_id = any (v_team_a);

  select avg(ps.current_rating)::numeric
    into v_rating_b_avg
    from player_stats ps
   where ps.sport = v_sport and ps.mode = v_mode and ps.user_id = any (v_team_b);

  v_expected_a := 1.0 / (1.0 + power(10.0, (v_rating_b_avg - v_rating_a_avg) / 400.0));
  v_expected_b := 1.0 - v_expected_a;

  if v_winner = 'a' then
    v_actual_a := 1.0; v_actual_b := 0.0;
  else
    v_actual_a := 0.0; v_actual_b := 1.0;
  end if;

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
           last_match_at  = greatest(coalesce(last_match_at, now()), now())
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
           last_match_at  = greatest(coalesce(last_match_at, now()), now())
     where user_id = v_uid and sport = v_sport and mode = v_mode;
  end loop;

  update tournament_group_matches
     set rating_applied_at = now()
   where id = p_match_id;
end;
$$;

comment on function fn_recalculate_elo_for_group_match(uuid) is
  'ELO (K=32) para tournament_group_match. Mode inferido del tamaño del equipo. Idempotente via rating_applied_at.';
