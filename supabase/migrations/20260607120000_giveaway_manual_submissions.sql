-- Envíos manuales de mecánicas (share) + índice para pagos de entradas extra.

create table if not exists public.club_giveaway_manual_submissions (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.club_giveaways(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('share')),
  evidence_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (giveaway_id, user_id, kind)
);

create index if not exists idx_giveaway_manual_submissions_pending
  on public.club_giveaway_manual_submissions (giveaway_id, status)
  where status = 'pending';

alter table public.club_giveaway_manual_submissions enable row level security;

create policy giveaway_manual_submissions_select on public.club_giveaway_manual_submissions
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.club_giveaways g
      where g.id = giveaway_id
        and public.fn_is_club_comms_staff(g.club_id, auth.uid())
    )
  );

create policy giveaway_manual_submissions_insert_self on public.club_giveaway_manual_submissions
  for insert with check (user_id = auth.uid());

create policy giveaway_manual_submissions_staff_update on public.club_giveaway_manual_submissions
  for update using (
    exists (
      select 1 from public.club_giveaways g
      where g.id = giveaway_id
        and public.fn_is_club_comms_staff(g.club_id, auth.uid())
    )
  );

create index if not exists idx_transactions_giveaway_pay
  on public.transactions (club_id, customer_user_id, ref_id)
  where kind = 'custom' and status = 'captured';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'club_giveaway_manual_submissions'
  ) then
    alter publication supabase_realtime add table public.club_giveaway_manual_submissions;
  end if;
end $$;
