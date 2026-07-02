-- 20260711000000 · Historial de rating: snapshots nightly + backfill retroactivo.
--
-- ranking_snapshots existe desde mig 019 (+mode en 130) pero NADA escribía en
-- ella → getUserRankingHistory siempre devolvía vacío y la sparkline caía a la
-- línea sintética plana en 2500 (docs/guides/04-placeholders.md §RatingSparkline).
-- El propio código lo asumía pendiente: "Rating recompute is expected to run
-- nightly via pg_cron" (src/server/actions/ranking.ts:3-5) y mig 130: "el
-- futuro job de snapshots debe setear mode al insertar".
--
-- Esta migración:
--   1. fn_process_ranking_snapshots(): 1 fila por (user, sport, mode) cuando
--      el rating cambió desde el último snapshot. rank_position con la misma
--      semántica que getRanking: solo rankea quienes cumplen el threshold
--      fn_get_ranking_min_matches() (mig 116); el resto queda null.
--   2. Cron diario a las 06:00 UTC (hueco libre en el calendario de jobs:
--      08:00 planes, 08:15 memberships, min 7 MV ranking, min 5 quedadas).
--   3. Backfill retroactivo: reconstruye la curva hacia atrás desde
--      player_stats.current_rating restando deltas — matches.rating_deltas
--      (casuales, mig 065) + match_rating_applications (torneo, mig
--      20260710000000) — 1 punto por día. Partidos legacy sin delta registrado
--      solo aplanan el tramo antiguo; el punto final SIEMPRE cuadra con el
--      rating real de player_stats.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- 1) Función nightly
-- ---------------------------------------------------------------------------
create or replace function public.fn_process_ranking_snapshots()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_matches int := coalesce(public.fn_get_ranking_min_matches(), 3);
  v_inserted    int := 0;
begin
  with qualifying as (
    -- rank solo entre quienes cumplen el threshold (semántica de getRanking)
    select ps.user_id, ps.sport, ps.mode,
           rank() over (partition by ps.sport, ps.mode
                        order by ps.current_rating desc) as rk
      from player_stats ps
     where ps.matches_total >= v_min_matches
  ),
  changed as (
    select ps.user_id, ps.sport, ps.mode, ps.current_rating, q.rk
      from player_stats ps
      left join qualifying q
        on q.user_id = ps.user_id and q.sport = ps.sport and q.mode = ps.mode
      left join lateral (
        select rs.rating
          from ranking_snapshots rs
         where rs.user_id = ps.user_id
           and rs.sport = ps.sport
           and rs.mode is not distinct from ps.mode
         order by rs.snapshot_at desc
         limit 1
      ) last on true
     where last.rating is distinct from ps.current_rating
  )
  insert into ranking_snapshots (user_id, sport, rating, rank_position, snapshot_at, mode)
  select user_id, sport, current_rating, rk, now(), mode
    from changed;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.fn_process_ranking_snapshots() is
  'Snapshot diario de rating por (user, sport, mode). Solo inserta cuando el rating cambió desde el último snapshot. rank_position solo para quienes cumplen fn_get_ranking_min_matches().';

revoke all on function public.fn_process_ranking_snapshots() from public;
revoke execute on function public.fn_process_ranking_snapshots() from anon, authenticated;
grant execute on function public.fn_process_ranking_snapshots() to service_role;

-- ---------------------------------------------------------------------------
-- 2) Cron diario
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'process-ranking-snapshots-daily') then
    perform cron.unschedule('process-ranking-snapshots-daily');
  end if;
  perform cron.schedule(
    'process-ranking-snapshots-daily',
    '0 6 * * *',
    $cron$ select public.fn_process_ranking_snapshots() $cron$
  );
end $$;

-- ---------------------------------------------------------------------------
-- 3) Backfill retroactivo (solo si la tabla está vacía — idempotente)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from ranking_snapshots limit 1) then
    raise notice 'ranking_snapshots ya tiene datos — backfill omitido';
    return;
  end if;

  -- Reconstrucción backward: rating tras cada evento = current_rating menos
  -- la suma de los deltas de eventos posteriores. Ancla la curva al rating
  -- real de hoy; huecos legacy (sin delta) solo aplanan el tramo antiguo.
  with events as (
    select mra.user_id, mra.sport, mra.mode, mra.delta, mra.applied_at as at
      from match_rating_applications mra
    union all
    select (kv.key)::uuid, m.sport, m.mode, (kv.value)::numeric::int,
           coalesce(m.played_at, m.created_at)
      from matches m
      cross join lateral jsonb_each_text(m.rating_deltas) kv
     where m.rating_applied_at is not null
       and m.rating_deltas <> '{}'::jsonb
  ),
  scored as (
    select e.user_id, e.sport, e.mode, e.at,
           greatest(100, ps.current_rating - coalesce(
             sum(e.delta) over (
               partition by e.user_id, e.sport, e.mode
               order by e.at desc
               rows between unbounded preceding and 1 preceding
             ), 0)) as rating_after
      from events e
      join player_stats ps
        on ps.user_id = e.user_id and ps.sport = e.sport and ps.mode = e.mode
  ),
  daily as (
    -- 1 punto por día: el último evento de cada día
    select distinct on (user_id, sport, mode, date_trunc('day', at))
           user_id, sport, mode, at, rating_after
      from scored
     order by user_id, sport, mode, date_trunc('day', at), at desc
  )
  insert into ranking_snapshots (user_id, sport, rating, rank_position, snapshot_at, mode)
  select user_id, sport, rating_after, null, at, mode
    from daily;

  -- Punto "hoy" para cerrar la curva en el rating actual (asegura >= 2 puntos
  -- para cualquiera con historial y ancla el final al valor real).
  insert into ranking_snapshots (user_id, sport, rating, rank_position, snapshot_at, mode)
  select ps.user_id, ps.sport, ps.current_rating, null, now(), ps.mode
    from player_stats ps
   where ps.matches_total > 0
     and exists (
       select 1 from ranking_snapshots rs
        where rs.user_id = ps.user_id and rs.sport = ps.sport
          and rs.mode is not distinct from ps.mode
     );
end $$;
