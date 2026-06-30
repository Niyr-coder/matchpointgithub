-- Track match start time and duration for analytics and monitor state restoration
alter table public.bracket_matches
  add column if not exists started_at timestamptz,
  add column if not exists duration_ms integer;

alter table public.tournament_group_matches
  add column if not exists started_at timestamptz,
  add column if not exists duration_ms integer;
