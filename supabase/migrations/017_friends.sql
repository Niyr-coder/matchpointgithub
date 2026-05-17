-- 017 · Friends + blocks. See 20-database.md §14 and 30-rls.md §4.11.

create table friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz default now() not null,
  responded_at timestamptz,
  check (from_user_id <> to_user_id),
  unique (from_user_id, to_user_id)
);

create table friendships (
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid not null references profiles(id) on delete cascade,
  since timestamptz default now() not null,
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  reason text,
  created_at timestamptz default now() not null,
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table friend_requests enable row level security;
create policy fr_self_visible on friend_requests for select
  using (from_user_id = auth.uid() or to_user_id = auth.uid());
create policy fr_send on friend_requests for insert with check (from_user_id = auth.uid());
create policy fr_respond on friend_requests for update using (to_user_id = auth.uid());
create policy fr_cancel on friend_requests for delete using (from_user_id = auth.uid());

alter table friendships enable row level security;
create policy friendships_self on friendships for select
  using (user_a = auth.uid() or user_b = auth.uid());
create policy friendships_delete_self on friendships for delete
  using (user_a = auth.uid() or user_b = auth.uid());

alter table blocks enable row level security;
create policy blocks_self on blocks for all using (blocker_id = auth.uid());
