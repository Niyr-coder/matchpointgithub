-- 130 · ranking_snapshots mode-aware (singles vs doubles).
-- Hasta ahora la tabla no distinguía modo, así que el chart de evolución mostraba
-- la misma curva para singles y dobles (ver TODO en UserHome.tsx). Agregamos
-- `mode` para separar las series. Nullable: filas viejas (si las hubiera) quedan
-- sin modo y los fetchers (que filtran por mode) las ignoran. El futuro job de
-- snapshots debe setear mode al insertar.

alter table public.ranking_snapshots
  add column if not exists mode public.mp_match_mode;

create index if not exists idx_ranking_snapshots_user_sport_mode
  on public.ranking_snapshots (user_id, sport, mode, snapshot_at desc);
