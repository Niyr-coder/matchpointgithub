-- 053 · Matches sueltos (casual/pickup) reportados por jugadores fuera de torneo.
--
-- Verificación previa al schema (no duplicar):
--  · `mp_match_status` YA existe en 002_enums.sql con los valores
--    ('scheduled','live','reported','confirmed','disputed','walkover','cancelled').
--    Los cinco estados pedidos por el spec del agente
--    ('scheduled','reported','confirmed','disputed','cancelled') son un subconjunto,
--    así que se reutiliza el enum existente en lugar de crear uno nuevo
--    (evita migraciones bloqueantes de tipo). Las actions solo permiten
--    transitar entre el subconjunto declarado.
--  · No existe tabla `matches` todavía: la única tabla relacionada es
--    `match_results` (snapshot legacy de resultados con side_a/side_b jsonb,
--    creado en 019_ranking.sql) y `bracket_matches` (partidos atados a un
--    bracket de torneo, en 020_tournaments.sql). Esta tabla es independiente:
--    representa el partido casual/agendado con su ciclo de vida completo
--    (programar → reportar → confirmar/disputar).
--  · `mp_match_mode` es nuevo: 'singles' o 'doubles'.

create type mp_match_mode as enum ('singles', 'doubles');

create table matches (
  id uuid primary key default gen_random_uuid(),
  sport mp_sport not null,
  mode mp_match_mode not null,
  club_id uuid references clubs(id) on delete set null,
  court_id uuid references courts(id) on delete set null,
  played_at timestamptz not null,
  duration_min int not null default 60,
  team_a_player_ids uuid[] not null,
  team_b_player_ids uuid[] not null,
  score jsonb,
  reported_by uuid references profiles(id) on delete set null,
  reported_at timestamptz,
  confirmed_by uuid[] not null default '{}',
  confirmed_at timestamptz,
  disputed_reason text,
  status mp_match_status not null default 'scheduled',
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- CHECK · simetría de equipos.
  -- En singles: array_length(team_a)=1 y array_length(team_b)=1.
  -- En doubles: array_length(team_a)=2 y array_length(team_b)=2.
  -- La forma genérica cubre ambos: A debe tener ≥1 y B debe igualar a A.
  constraint matches_teams_balanced check (
    array_length(team_a_player_ids, 1) >= 1
    and array_length(team_b_player_ids, 1) = array_length(team_a_player_ids, 1)
  ),

  -- CHECK adicional · respeta la cardinalidad por modo (defensa en profundidad
  -- por si la app pasa mode='singles' con dos jugadores en team A).
  constraint matches_mode_cardinality check (
    (mode = 'singles' and array_length(team_a_player_ids, 1) = 1)
    or (mode = 'doubles' and array_length(team_a_player_ids, 1) = 2)
  ),

  -- CHECK · status 'confirmed' requiere haber sido reportado primero.
  constraint matches_confirmed_requires_report check (
    status <> 'confirmed' or reported_at is not null
  )
);

create index idx_matches_played_at on matches (played_at desc);
create index idx_matches_team_a_gin on matches using gin (team_a_player_ids);
create index idx_matches_team_b_gin on matches using gin (team_b_player_ids);
create index idx_matches_status on matches (status);

create trigger tg_matches_updated_at
  before update on matches
  for each row execute function tg_set_updated_at();

-- RLS
alter table matches enable row level security;

-- SELECT: cualquier participante (en team A o B) o admin.
create policy matches_select_participant_or_admin on matches
  for select
  using (
    auth.uid() = any (team_a_player_ids)
    or auth.uid() = any (team_b_player_ids)
    or mp_is_admin()
  );

-- INSERT: usuarios autenticados; el created_by debe ser el usuario actual.
create policy matches_insert_authenticated on matches
  for insert
  with check (
    auth.uid() is not null
    and created_by = auth.uid()
  );

-- UPDATE: solo participantes o admin (reportar / confirmar / disputar).
create policy matches_update_participant_or_admin on matches
  for update
  using (
    auth.uid() = any (team_a_player_ids)
    or auth.uid() = any (team_b_player_ids)
    or mp_is_admin()
  )
  with check (
    auth.uid() = any (team_a_player_ids)
    or auth.uid() = any (team_b_player_ids)
    or mp_is_admin()
  );

comment on table matches is
  'Partidos casuales reportados por jugadores fuera de torneo. Cuando llegan a status=confirmed, alimentan el cálculo de ranking (recálculo pendiente, ver TODO en src/server/actions/matches.ts).';
comment on column matches.confirmed_by is
  'Lista de player_ids que confirmaron el resultado. Cuando length == total de jugadores, status pasa a confirmed.';
comment on column matches.score is
  'JSONB con formato {"sets":[{"a":11,"b":9},{"a":11,"b":7}],"winner":"a"}.';
