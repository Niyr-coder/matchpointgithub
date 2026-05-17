-- 052 · Índices de performance para queries del dashboard del jugador.
--
-- Motivación (medido con tiempos del Server Action en /dashboard/user/*):
--   /dashboard/user/ranking ~970 ms · application-code ~641 ms
--   /dashboard/user/eventos ~555 ms · application-code ~360 ms
--   /dashboard/user        ~949 ms · application-code ~516 ms
--
-- Cada índice cubre exactamente una query caliente y caliente:
--
-- 1) idx_player_stats_sport_rating
--    Cubre `getRanking()` en src/server/actions/ranking.ts:
--       select * from player_stats where sport = $1
--         order by current_rating desc limit ... offset ...
--    Hoy player_stats sólo tiene PK (user_id, sport); ordenar por
--    current_rating obliga a full scan + sort. Con un índice compuesto
--    (sport, current_rating desc) el planner usa index scan directo y
--    el limit corta temprano.
--
-- 2) idx_registrations_player_ids_gin
--    Cubre `EventosScreen.fetchMyRegisteredIds`:
--       select tournament_id from registrations
--         where player_ids @> ARRAY[$userId]::uuid[]
--           and status in ('pending','accepted');
--    `player_ids` es `uuid[]`; sin GIN el operador @> degrada a seq scan
--    sobre toda la tabla de registrations. GIN permite lookup O(log n)
--    por element membership.
--
-- 3) idx_ranking_snapshots_user_sport_at (parcial, solo para gráfico de UserHome)
--    Cubre `UserHome.loadData` y `getUserRankingHistory`:
--       select rating, snapshot_at from ranking_snapshots
--         where user_id = $1 and sport = $2
--         order by snapshot_at desc limit N;
--    Ya existe `idx_ranking_snapshots_user_sport (user_id, sport,
--    snapshot_at desc)` desde 019; este archivo NO lo duplica — se deja
--    nota para auditoría. Verificado: ese índice ya cubre la query.
--
-- Notas:
--   · Usamos `create index if not exists` para que la migration sea
--     idempotente y segura en re-ejecuciones.
--   · No tocamos índices/constraints previos; ninguna migration anterior
--     creó estos índices (`grep "create index" supabase/migrations/*.sql`).
--   · No se crea índice sobre `tournaments_public_summary` porque es una
--     view; el ORDER BY starts_at se resuelve contra tournaments, que ya
--     tiene `idx_tournaments_starts` desde 020.

-- 1) Ranking leaderboard por deporte.
create index if not exists idx_player_stats_sport_rating
  on player_stats (sport, current_rating desc);

-- 2) Lookup de inscripciones del jugador en torneos.
create index if not exists idx_registrations_player_ids_gin
  on registrations using gin (player_ids);
