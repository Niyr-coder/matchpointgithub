-- Fase de grupos para torneos groups_to_knockout (§01-tournaments.md §13).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mp_tournament_category_stage') then
    create type mp_tournament_category_stage as enum (
      'pending_groups',
      'group_stage',
      'group_complete',
      'knockout',
      'complete'
    );
  end if;
end $$;

alter table public.tournament_categories
  add column if not exists stage mp_tournament_category_stage not null default 'pending_groups',
  add column if not exists group_playoff_config jsonb;

comment on column public.tournament_categories.stage is
  'Fase competitiva de la categoría (grupos → eliminatoria).';
comment on column public.tournament_categories.group_playoff_config is
  'Config fase grupos: { groupsCount, advancePerGroup, finalScoringOverride? }.';

-- ── Grupos ─────────────────────────────────────────────────────────────
create table if not exists public.tournament_groups (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

create index if not exists idx_tournament_groups_category
  on public.tournament_groups (category_id, sort_order);

create table if not exists public.tournament_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.tournament_groups(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  sort_order int not null default 0,
  unique (group_id, registration_id)
);

create index if not exists idx_tgm_registration on public.tournament_group_members (registration_id);

-- Una inscripción solo puede estar en un grupo por categoría.
create unique index if not exists uq_tgm_category_registration
  on public.tournament_group_members (registration_id)
  include (group_id);

create table if not exists public.tournament_group_matches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.tournament_groups(id) on delete cascade,
  round_no int not null check (round_no >= 1),
  match_no int not null check (match_no >= 1),
  side_a_registration_id uuid not null references public.registrations(id),
  side_b_registration_id uuid not null references public.registrations(id),
  scheduled_at timestamptz,
  court_id uuid references public.courts(id),
  status mp_match_status not null default 'scheduled',
  winner_side char(1) check (winner_side in ('a', 'b', 'd')),
  score jsonb,
  unique (group_id, round_no, match_no),
  check (side_a_registration_id <> side_b_registration_id)
);

create index if not exists idx_tgm_group_round
  on public.tournament_group_matches (group_id, round_no, match_no);

-- ── RLS ────────────────────────────────────────────────────────────────
alter table public.tournament_groups enable row level security;
alter table public.tournament_group_members enable row level security;
alter table public.tournament_group_matches enable row level security;

create policy tg_public_select on public.tournament_groups for select using (true);
create policy tg_admin_all on public.tournament_groups for all using (mp_is_admin());
create policy tg_partner_write on public.tournament_groups for all using (
  exists (
    select 1
    from public.tournament_categories tc
    join public.tournaments t on t.id = tc.tournament_id
    where tc.id = category_id
      and t.partner_id is not null
      and mp_is_partner_admin_of(t.partner_id)
  )
);

create policy tgm_public_select on public.tournament_group_members for select using (true);
create policy tgm_admin_all on public.tournament_group_members for all using (mp_is_admin());
create policy tgm_partner_write on public.tournament_group_members for all using (
  exists (
    select 1
    from public.tournament_groups tg
    join public.tournament_categories tc on tc.id = tg.category_id
    join public.tournaments t on t.id = tc.tournament_id
    where tg.id = group_id
      and t.partner_id is not null
      and mp_is_partner_admin_of(t.partner_id)
  )
);

create policy tgm_match_public_select on public.tournament_group_matches for select using (true);
create policy tgm_match_admin_all on public.tournament_group_matches for all using (mp_is_admin());
create policy tgm_match_partner_write on public.tournament_group_matches for all using (
  exists (
    select 1
    from public.tournament_groups tg
    join public.tournament_categories tc on tc.id = tg.category_id
    join public.tournaments t on t.id = tc.tournament_id
    where tg.id = group_id
      and t.partner_id is not null
      and mp_is_partner_admin_of(t.partner_id)
  )
);
create policy tgm_match_player_report on public.tournament_group_matches for update using (
  exists (
    select 1 from public.registrations r
    where r.id in (side_a_registration_id, side_b_registration_id)
      and auth.uid() = any (r.player_ids)
  )
);

-- ── Realtime ───────────────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.tournament_groups;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.tournament_group_members;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.tournament_group_matches;
exception when duplicate_object then null;
end $$;
