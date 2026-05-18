create table if not exists public.club_followers (
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

create index if not exists club_followers_club_idx on public.club_followers(club_id);

alter table public.club_followers enable row level security;

create policy "club_followers_read_all"
  on public.club_followers
  for select
  to authenticated
  using (true);

create policy "club_followers_self_insert"
  on public.club_followers
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "club_followers_self_delete"
  on public.club_followers
  for delete
  to authenticated
  using (user_id = auth.uid());
