-- 020 · Tournaments + leagues + brackets.
-- partner_orgs FK added in 026_partners.sql.
-- See 20-database.md §17 and 30-rls.md §4.14.

create table leagues (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid,
  name text not null,
  slug text unique not null,
  sport mp_sport not null,
  description text,
  cover_url text,
  season text,
  status text not null default 'draft' check (status in ('draft','active','finished','archived')),
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create trigger tg_leagues_updated before update on leagues
  for each row execute function tg_set_updated_at();

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references leagues(id) on delete set null,
  partner_id uuid,
  club_id uuid references clubs(id),
  name text not null,
  slug text unique not null,
  description text,
  cover_url text,
  sport mp_sport not null,
  format mp_tournament_format not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  status mp_event_status not null default 'draft',
  max_participants int,
  entry_fee_cents int not null default 0,
  currency mp_currency,
  prize_pool_cents int,
  rules_url text,
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_tournaments_starts on tournaments (starts_at);
create trigger tg_tournaments_updated before update on tournaments
  for each row execute function tg_set_updated_at();

create table tournament_categories (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  gender text check (gender in ('m','f','mixed','open')),
  level mp_skill_level,
  age_min int,
  age_max int,
  max_teams int
);

create table registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  category_id uuid references tournament_categories(id),
  team_id uuid references teams(id),
  player_ids uuid[] not null,
  registered_by uuid not null references profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn','waitlist')),
  paid_transaction_id uuid references transactions(id),
  created_at timestamptz default now() not null
);

create table brackets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  category_id uuid references tournament_categories(id),
  format mp_tournament_format not null,
  size int not null,
  generated_at timestamptz default now() not null,
  generated_by uuid references profiles(id)
);

create table bracket_matches (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references brackets(id) on delete cascade,
  round int not null,
  position int not null,
  side_a_registration_id uuid references registrations(id),
  side_b_registration_id uuid references registrations(id),
  scheduled_at timestamptz,
  court_id uuid references courts(id),
  status mp_match_status not null default 'scheduled',
  winner_side char(1) check (winner_side in ('a','b','d')),
  score jsonb,
  match_result_id uuid references match_results(id),
  unique (bracket_id, round, position)
);
create index idx_bracket_matches_bracket on bracket_matches (bracket_id, round, position);

-- backfill FK on match_results.tournament_match_id
alter table match_results
  add constraint mr_tournament_match_fk foreign key (tournament_match_id)
  references bracket_matches(id);

alter table leagues enable row level security;
create policy l_public_select on leagues for select using (status in ('active','finished'));
create policy l_admin_all on leagues for all using (mp_is_admin());

alter table tournaments enable row level security;
create policy t_public_select on tournaments for select
  using (status not in ('draft','cancelled'));
create policy t_admin_all on tournaments for all using (mp_is_admin());
-- partner write policy added in 026 once partner_members exists.

alter table tournament_categories enable row level security;
create policy tc_public_select on tournament_categories for select using (true);
create policy tc_admin_all on tournament_categories for all using (mp_is_admin());

alter table registrations enable row level security;
create policy reg_visible on registrations for select using (
  registered_by = auth.uid()
  or auth.uid() = any(player_ids)
  or mp_is_admin()
);
create policy reg_self_register on registrations for insert
  with check (registered_by = auth.uid() and auth.uid() = any(player_ids));
create policy reg_self_withdraw on registrations for update
  using (registered_by = auth.uid() and status in ('pending','accepted'));

alter table brackets enable row level security;
create policy br_public_select on brackets for select using (true);
create policy br_admin_write on brackets for all using (mp_is_admin());

alter table bracket_matches enable row level security;
create policy bm_public_select on bracket_matches for select using (true);
create policy bm_admin_write on bracket_matches for all using (mp_is_admin());
create policy bm_player_report_score on bracket_matches for update using (
  exists(select 1 from registrations r
         where r.id in (side_a_registration_id, side_b_registration_id)
           and auth.uid() = any(r.player_ids))
);
