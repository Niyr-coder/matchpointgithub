-- 058 · Recálculo automático de ELO al confirmar un `matches`.
--
-- Verificación previa al schema:
--  · `matches` existe (migration 053) con columnas team_a_player_ids uuid[],
--    team_b_player_ids uuid[], score jsonb (formato
--    {"sets":[{"a":11,"b":9},...],"winner":"a"|"b"}) y status mp_match_status.
--  · `player_stats` existe (migration 019) con PK (user_id, sport) y columnas:
--      matches_total int  default 0
--      wins         int  default 0
--      losses       int  default 0
--      current_rating int default 1500
--      peak_rating  int  default 1500
--      last_match_at timestamptz
--      updated_at   timestamptz default now()
--    El default en la tabla es 1500, pero el seed (migration 034) usa 2500
--    para todos los profiles existentes y nuevos (MP Rating 2.5). Aquí, al
--    crear filas faltantes desde la función, se usa 2500 para mantener
--    coherencia con el seed y con STARTING_RATING del frontend.
--  · `mp_match_status` incluye 'confirmed' (migration 002).
--
-- Idempotencia:
--  · Se agrega `matches.rating_applied_at timestamptz`. La función verifica
--    al inicio; si ya está set, no recalcula. El UPDATE de la propia matches
--    al final marca rating_applied_at = now(), pero NO re-dispara el trigger
--    porque éste sólo escucha cambios en `status`.

-- ---------------------------------------------------------------------------
-- 1) Columna de marca para idempotencia
-- ---------------------------------------------------------------------------
alter table matches
  add column if not exists rating_applied_at timestamptz;

comment on column matches.rating_applied_at is
  'Timestamp del recálculo ELO. NULL = pendiente. Si está set, el trigger no recalcula (idempotencia).';

-- ---------------------------------------------------------------------------
-- 2) Función de recálculo ELO
-- ---------------------------------------------------------------------------
create or replace function fn_recalculate_elo_for_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match           matches%rowtype;
  v_winner          text;
  v_sport           mp_sport;
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
  -- Cargar la fila del match
  select * into v_match from matches where id = p_match_id;
  if not found then
    raise notice 'fn_recalculate_elo_for_match: match % no encontrado', p_match_id;
    return;
  end if;

  -- Idempotencia: si ya se aplicó el rating, no recalcular.
  if v_match.rating_applied_at is not null then
    return;
  end if;

  -- Solo procesar partidos confirmados (defensa en profundidad).
  if v_match.status <> 'confirmed' then
    return;
  end if;

  -- Validar score: debe existir y contener un winner válido.
  if v_match.score is null then
    raise exception 'fn_recalculate_elo_for_match: match % sin score', p_match_id;
  end if;

  v_winner := v_match.score ->> 'winner';
  if v_winner is null or v_winner not in ('a', 'b') then
    raise exception 'fn_recalculate_elo_for_match: match % score.winner inválido (%). Solo se soporta ''a'' o ''b''.',
      p_match_id, coalesce(v_winner, 'null');
  end if;

  v_sport  := v_match.sport;
  v_team_a := v_match.team_a_player_ids;
  v_team_b := v_match.team_b_player_ids;

  if v_team_a is null or v_team_b is null
     or array_length(v_team_a, 1) is null
     or array_length(v_team_b, 1) is null then
    raise exception 'fn_recalculate_elo_for_match: match % con equipos vacíos', p_match_id;
  end if;

  -- Asegurar que cada jugador tenga fila en player_stats (default 2500).
  foreach v_uid in array (v_team_a || v_team_b) loop
    insert into player_stats (user_id, sport, current_rating, peak_rating)
    values (v_uid, v_sport, v_starting_rating, v_starting_rating)
    on conflict (user_id, sport) do nothing;
  end loop;

  -- Calcular promedio del rating actual de cada equipo.
  select avg(ps.current_rating)::numeric
    into v_rating_a_avg
    from player_stats ps
   where ps.sport = v_sport and ps.user_id = any (v_team_a);

  select avg(ps.current_rating)::numeric
    into v_rating_b_avg
    from player_stats ps
   where ps.sport = v_sport and ps.user_id = any (v_team_b);

  -- Expected scores (ELO clásico).
  v_expected_a := 1.0 / (1.0 + power(10.0, (v_rating_b_avg - v_rating_a_avg) / 400.0));
  v_expected_b := 1.0 - v_expected_a;

  -- Actual scores.
  if v_winner = 'a' then
    v_actual_a := 1.0;
    v_actual_b := 0.0;
  else
    v_actual_a := 0.0;
    v_actual_b := 1.0;
  end if;

  -- Delta del equipo (mismo delta a cada miembro: simplificación estándar).
  v_delta_a := round(v_k * (v_actual_a - v_expected_a))::int;
  v_delta_b := round(v_k * (v_actual_b - v_expected_b))::int;

  -- Aplicar delta a cada jugador del team A.
  foreach v_uid in array v_team_a loop
    select current_rating into v_cur
      from player_stats
     where user_id = v_uid and sport = v_sport
       for update;

    v_new := greatest(v_min_rating, v_cur + v_delta_a);

    update player_stats
       set current_rating = v_new,
           peak_rating    = greatest(peak_rating, v_new),
           matches_total  = matches_total + 1,
           wins           = wins   + (case when v_winner = 'a' then 1 else 0 end),
           losses         = losses + (case when v_winner = 'b' then 1 else 0 end),
           last_match_at  = greatest(coalesce(last_match_at, v_match.played_at), v_match.played_at)
     where user_id = v_uid and sport = v_sport;
  end loop;

  -- Aplicar delta a cada jugador del team B.
  foreach v_uid in array v_team_b loop
    select current_rating into v_cur
      from player_stats
     where user_id = v_uid and sport = v_sport
       for update;

    v_new := greatest(v_min_rating, v_cur + v_delta_b);

    update player_stats
       set current_rating = v_new,
           peak_rating    = greatest(peak_rating, v_new),
           matches_total  = matches_total + 1,
           wins           = wins   + (case when v_winner = 'b' then 1 else 0 end),
           losses         = losses + (case when v_winner = 'a' then 1 else 0 end),
           last_match_at  = greatest(coalesce(last_match_at, v_match.played_at), v_match.played_at)
     where user_id = v_uid and sport = v_sport;
  end loop;

  -- Marcar como aplicado (idempotencia). No re-dispara el trigger porque
  -- éste escucha solo cambios de `status`.
  update matches
     set rating_applied_at = now()
   where id = p_match_id;
end;
$$;

comment on function fn_recalculate_elo_for_match(uuid) is
  'Recalcula ELO (K=32, promedio para doubles, min 100) y actualiza player_stats al confirmar un match. Idempotente vía matches.rating_applied_at.';

-- ---------------------------------------------------------------------------
-- 3) Trigger functions (AFTER UPDATE OF status, AFTER INSERT)
-- ---------------------------------------------------------------------------
create or replace function tg_matches_recalculate_elo_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed'
     and (old.status is distinct from 'confirmed')
     and new.rating_applied_at is null then
    perform fn_recalculate_elo_for_match(new.id);
  end if;
  return null;
end;
$$;

create or replace function tg_matches_recalculate_elo_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Caso edge: match insertado directamente con status='confirmed'.
  if new.status = 'confirmed' and new.rating_applied_at is null then
    perform fn_recalculate_elo_for_match(new.id);
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Triggers en matches
-- ---------------------------------------------------------------------------
drop trigger if exists tg_recalculate_elo_on_confirm on matches;
create trigger tg_recalculate_elo_on_confirm
  after update of status on matches
  for each row
  execute function tg_matches_recalculate_elo_on_update();

drop trigger if exists tg_recalculate_elo_on_insert_confirmed on matches;
create trigger tg_recalculate_elo_on_insert_confirmed
  after insert on matches
  for each row
  execute function tg_matches_recalculate_elo_on_insert();
