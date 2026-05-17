-- 018 · Teams + invites. See 20-database.md §15 and 30-rls.md §4.12.

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  sport mp_sport,
  logo_url text,
  captain_id uuid not null references profiles(id),
  club_id uuid references clubs(id),
  created_at timestamptz default now() not null
);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('captain','player','substitute')),
  joined_at timestamptz default now() not null,
  primary key (team_id, user_id)
);

create table team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  invited_user_id uuid not null references profiles(id) on delete cascade,
  invited_by uuid not null references profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz default now() not null,
  responded_at timestamptz,
  unique (team_id, invited_user_id)
);

alter table teams enable row level security;
create policy teams_public_select on teams for select using (true);
create policy teams_captain_write on teams for all
  using (captain_id = auth.uid()) with check (captain_id = auth.uid());

alter table team_members enable row level security;
create policy tm_visible on team_members for select using (true);
create policy tm_captain_manage on team_members for all using (
  exists(select 1 from teams t where t.id = team_id and t.captain_id = auth.uid())
);
create policy tm_self_leave on team_members for delete using (user_id = auth.uid());

alter table team_invites enable row level security;
create policy ti_visible on team_invites for select using (
  invited_user_id = auth.uid()
  or exists(select 1 from teams t where t.id = team_id and t.captain_id = auth.uid())
);
create policy ti_send on team_invites for insert with check (
  exists(select 1 from teams t where t.id = team_id and t.captain_id = auth.uid())
);
create policy ti_respond on team_invites for update using (invited_user_id = auth.uid());
