-- 20260710000000 · ELO reversible en partidos de torneo.
--
-- Problema: correctBracketMatch/correctGroupMatch vuelven el partido a
-- 'reported' con otro ganador, pero la guarda rating_applied_at en
-- fn_recalculate_elo_* impide recalcular → un ganador mal cargado queda
-- grabado en player_stats para siempre.
--
-- Fix:
--   1. Tabla match_rating_applications: registra el delta EFECTIVO aplicado
--      a cada jugador por partido (incluye el clamp a rating mínimo), lo que
--      permite revertir con exactitud.
--   2. fn_recalculate_elo_* ahora insertan esas filas al aplicar.
--   3. fn_revert_elo_* deshacen deltas + contadores y limpian
--      rating_applied_at. Devuelven false para partidos aplicados antes de
--      esta migración (sin filas) → esos NO se revierten ni re-aplican, se
--      preserva el comportamiento previo.
--   4. Los triggers detectan cambio de winner_side sobre un partido ya
--      aplicado → revert + re-aplicar. Corrección de solo-score (mismo
--      ganador) no toca el ELO.
--
-- Limitación conocida (aceptada para beta): la reversión deshace el delta de
-- ESTE partido; no re-computa la cadena de partidos posteriores del jugador.
-- peak_rating tampoco se revierte (es cota histórica).

-- ---------------------------------------------------------------------------
-- 1) Tabla
-- ---------------------------------------------------------------------------
create table public.match_rating_applications (
  id          uuid primary key default gen_random_uuid(),
  match_type  text not null check (match_type in ('bracket', 'group')),
  match_id    uuid not null,
  user_id     uuid not null references profiles(id) on delete cascade,
  sport       mp_sport not null,
  mode        mp_match_mode not null,
  delta       int not null,
  won         boolean not null,
  applied_at  timestamptz not null default now(),
  unique (match_type, match_id, user_id)
);

create index idx_mra_match on public.match_rating_applications (match_type, match_id);
create index idx_mra_user on public.match_rating_applications (user_id);

comment on table public.match_rating_applications is
  'Delta efectivo de ELO aplicado por jugador y partido de torneo. Permite revertir correcciones. Server-only.';

-- Audit
create trigger tg_audit_match_rating_applications
  after insert or update or delete on public.match_rating_applications
  for each row execute function tg_audit();

-- RLS: solo admin puede leer; nadie muta desde el cliente (escrituras solo
-- vía funciones SECURITY DEFINER / service role).
alter table public.match_rating_applications enable row level security;

create policy mra_admin_select on public.match_rating_applications
  for select using (public.mp_is_admin());

-- ---------------------------------------------------------------------------
-- 2) fn_recalculate_elo_for_bracket_match — ahora registra deltas efectivos
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

    insert into match_rating_applications (match_type, match_id, user_id, sport, mode, delta, won)
    values ('bracket', p_match_id, v_uid, v_sport, v_mode, v_new - v_cur, v_winner = 'a')
    on conflict (match_type, match_id, user_id)
    do update set sport = excluded.sport, mode = excluded.mode,
                  delta = excluded.delta, won = excluded.won, applied_at = now();
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

    insert into match_rating_applications (match_type, match_id, user_id, sport, mode, delta, won)
    values ('bracket', p_match_id, v_uid, v_sport, v_mode, v_new - v_cur, v_winner = 'b')
    on conflict (match_type, match_id, user_id)
    do update set sport = excluded.sport, mode = excluded.mode,
                  delta = excluded.delta, won = excluded.won, applied_at = now();
  end loop;

  update bracket_matches
     set rating_applied_at = now()
   where id = p_match_id;
end;
$$;

comment on function fn_recalculate_elo_for_bracket_match(uuid) is
  'ELO (K=32) para bracket_match. Registra delta efectivo en match_rating_applications. Idempotente via rating_applied_at.';

-- ---------------------------------------------------------------------------
-- 3) fn_recalculate_elo_for_group_match — ahora registra deltas efectivos
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

    insert into match_rating_applications (match_type, match_id, user_id, sport, mode, delta, won)
    values ('group', p_match_id, v_uid, v_sport, v_mode, v_new - v_cur, v_winner = 'a')
    on conflict (match_type, match_id, user_id)
    do update set sport = excluded.sport, mode = excluded.mode,
                  delta = excluded.delta, won = excluded.won, applied_at = now();
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

    insert into match_rating_applications (match_type, match_id, user_id, sport, mode, delta, won)
    values ('group', p_match_id, v_uid, v_sport, v_mode, v_new - v_cur, v_winner = 'b')
    on conflict (match_type, match_id, user_id)
    do update set sport = excluded.sport, mode = excluded.mode,
                  delta = excluded.delta, won = excluded.won, applied_at = now();
  end loop;

  update tournament_group_matches
     set rating_applied_at = now()
   where id = p_match_id;
end;
$$;

comment on function fn_recalculate_elo_for_group_match(uuid) is
  'ELO (K=32) para tournament_group_match. Registra delta efectivo en match_rating_applications. Idempotente via rating_applied_at.';

-- ---------------------------------------------------------------------------
-- 4) Reversión
-- ---------------------------------------------------------------------------
-- Devuelve true si revirtió; false si el partido no tiene filas de aplicación
-- (aplicado antes de esta migración) — en ese caso NO limpia rating_applied_at
-- para no re-aplicar sin haber revertido.
create or replace function fn_revert_elo_for_match(p_match_type text, p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count int := 0;
  v_min_rating constant int := 100;
begin
  for v_row in
    select user_id, sport, mode, delta, won
      from match_rating_applications
     where match_type = p_match_type and match_id = p_match_id
     order by user_id
  loop
    v_count := v_count + 1;
    update player_stats
       set current_rating = greatest(v_min_rating, current_rating - v_row.delta),
           matches_total  = greatest(0, matches_total - 1),
           wins           = greatest(0, wins   - (case when v_row.won then 1 else 0 end)),
           losses         = greatest(0, losses - (case when v_row.won then 0 else 1 end))
     where user_id = v_row.user_id and sport = v_row.sport and mode = v_row.mode;
  end loop;

  if v_count = 0 then
    return false;
  end if;

  delete from match_rating_applications
   where match_type = p_match_type and match_id = p_match_id;

  if p_match_type = 'bracket' then
    update bracket_matches set rating_applied_at = null where id = p_match_id;
  else
    update tournament_group_matches set rating_applied_at = null where id = p_match_id;
  end if;

  return true;
end;
$$;

comment on function fn_revert_elo_for_match(text, uuid) is
  'Revierte los deltas efectivos de ELO de un partido de torneo. false = sin filas de aplicación (legacy), no revierte.';

-- ---------------------------------------------------------------------------
-- 5) Triggers: revert + re-aplicar cuando cambia el ganador de un partido
--    ya aplicado. Corrección de solo-score (mismo ganador) no toca ELO.
-- ---------------------------------------------------------------------------
create or replace function tg_bracket_matches_elo_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.winner_side is not null
     and old.rating_applied_at is not null
     and old.winner_side is distinct from new.winner_side then
    if fn_revert_elo_for_match('bracket', new.id) then
      perform fn_recalculate_elo_for_bracket_match(new.id);
    end if;
  elsif new.winner_side is not null
     and (old.winner_side is distinct from new.winner_side
          or old.status is distinct from new.status)
     and new.rating_applied_at is null then
    perform fn_recalculate_elo_for_bracket_match(new.id);
  end if;
  return null;
end;
$$;

create or replace function tg_group_matches_elo_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.winner_side is not null
     and old.rating_applied_at is not null
     and old.winner_side is distinct from new.winner_side then
    if fn_revert_elo_for_match('group', new.id) then
      perform fn_recalculate_elo_for_group_match(new.id);
    end if;
  elsif new.winner_side is not null
     and (old.winner_side is distinct from new.winner_side
          or old.status is distinct from new.status)
     and new.rating_applied_at is null then
    perform fn_recalculate_elo_for_group_match(new.id);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Hardening: estas funciones solo se llaman desde triggers, no desde
--    clientes (precedente: 20260702120000_revoke_notify_anon.sql).
-- ---------------------------------------------------------------------------
revoke execute on function fn_recalculate_elo_for_bracket_match(uuid) from anon, authenticated;
revoke execute on function fn_recalculate_elo_for_group_match(uuid) from anon, authenticated;
revoke execute on function fn_revert_elo_for_match(text, uuid) from anon, authenticated;
