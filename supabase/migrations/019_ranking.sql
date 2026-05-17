-- 019 · Ranking: match_results, player_stats, snapshots, mv.
-- bracket_matches FK on match_results.tournament_match_id added in 020.
-- See 20-database.md §16 and 30-rls.md §4.13.

create table match_results (
  id uuid primary key default gen_random_uuid(),
  sport mp_sport not null,
  played_at timestamptz not null,
  club_id uuid references clubs(id),
  reservation_id uuid references reservations(id),
  tournament_match_id uuid,
  side_a jsonb not null,
  side_b jsonb not null,
  winner_side char(1) check (winner_side in ('a','b','d')),
  status mp_match_status not null default 'reported',
  reported_by uuid not null references profiles(id),
  confirmed_by uuid references profiles(id),
  confirmed_at timestamptz,
  disputed_reason text,
  created_at timestamptz default now() not null
);
create index idx_match_results_played on match_results (played_at desc);

create table player_stats (
  user_id uuid not null references profiles(id) on delete cascade,
  sport mp_sport not null,
  matches_total int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  current_rating int not null default 1500,
  peak_rating int not null default 1500,
  last_match_at timestamptz,
  updated_at timestamptz default now() not null,
  primary key (user_id, sport)
);
create trigger tg_player_stats_updated before update on player_stats
  for each row execute function tg_set_updated_at();

create table ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  sport mp_sport not null,
  rating int not null,
  rank_position int,
  snapshot_at timestamptz default now() not null
);
create index idx_ranking_snapshots_user_sport on ranking_snapshots (user_id, sport, snapshot_at desc);

create materialized view mv_user_ranking as
  select ps.user_id, ps.sport, ps.current_rating, ps.wins, ps.losses,
         row_number() over (partition by ps.sport order by ps.current_rating desc) as rank
  from player_stats ps;
create unique index on mv_user_ranking (user_id, sport);

alter table match_results enable row level security;
create policy mr_confirmed_public on match_results for select using (status = 'confirmed');
create policy mr_involved_select on match_results for select using (
  reported_by = auth.uid()
  or side_a @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
  or side_b @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
);
create policy mr_report on match_results for insert with check (reported_by = auth.uid());
create policy mr_confirm on match_results for update using (
  side_a @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
  or side_b @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
  or mp_is_admin()
);

alter table player_stats enable row level security;
create policy ps_public_select on player_stats for select using (true);
-- writes via SECURITY DEFINER recompute fn only
revoke insert, update, delete on player_stats from authenticated, anon;

alter table ranking_snapshots enable row level security;
create policy rs_public_select on ranking_snapshots for select using (true);
revoke insert, update, delete on ranking_snapshots from authenticated, anon;
