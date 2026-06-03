-- Giveaways v2: feed del club, entradas ponderadas, mecánicas, sorteo programado.
-- Ver docs/product/10-giveaways.md

-- ── 1) Extender club_giveaways ───────────────────────────────────────────────

alter table public.club_giveaways
  add column if not exists subtitle text,
  add column if not exists category text,
  add column if not exists prize_image_url text,
  add column if not exists estimated_value_cents int check (estimated_value_cents is null or estimated_value_cents >= 0),
  add column if not exists owner_type text not null default 'club'
    check (owner_type in ('club', 'partner', 'matchpoint')),
  add column if not exists mechanics jsonb not null default '[]'::jsonb,
  add column if not exists rules jsonb not null default '[]'::jsonb,
  add column if not exists max_entries_per_user int not null default 1
    check (max_entries_per_user >= 1 and max_entries_per_user <= 50),
  add column if not exists draw_at timestamptz,
  add column if not exists draw_channel text,
  add column if not exists feed_post_id uuid,
  add column if not exists total_entry_weight int not null default 0 check (total_entry_weight >= 0);

alter table public.club_giveaways
  drop constraint if exists club_giveaways_status_check;
alter table public.club_giveaways
  add constraint club_giveaways_status_check
  check (status in ('draft', 'open', 'closing', 'closed', 'drawn', 'cancelled'));

-- ── 2) Entradas ponderadas ───────────────────────────────────────────────────

alter table public.club_giveaway_entries
  add column if not exists total_entries int not null default 1
    check (total_entries >= 1 and total_entries <= 50),
  add column if not exists rules_accepted_at timestamptz;

-- ── 3) Progreso por mecánica ─────────────────────────────────────────────────

create table if not exists public.club_giveaway_mechanic_progress (
  giveaway_id uuid not null references public.club_giveaways(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('follow', 'reserve', 'play', 'share', 'invite', 'buy', 'pay')),
  weight_applied int not null default 1 check (weight_applied >= 1 and weight_applied <= 20),
  completed_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id),
  primary key (giveaway_id, user_id, kind)
);

create index if not exists idx_club_giveaway_mech_user
  on public.club_giveaway_mechanic_progress (user_id, completed_at desc);

-- ── 4) Feed del club (staff-only) ────────────────────────────────────────────

create table if not exists public.club_feed_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  kind text not null check (kind in (
    'giveaway', 'event', 'result', 'photo', 'notice', 'spotlight', 'announcement'
  )),
  ref_id uuid,
  title text not null,
  body text,
  media_url text,
  badge text,
  cta_label text,
  cta_href text,
  payload jsonb not null default '{}'::jsonb,
  published_by uuid not null references public.profiles(id),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_club_feed_posts_club_published
  on public.club_feed_posts (club_id, published_at desc);

alter table public.club_giveaways
  drop constraint if exists club_giveaways_feed_post_fk;
alter table public.club_giveaways
  add constraint club_giveaways_feed_post_fk
  foreign key (feed_post_id) references public.club_feed_posts(id) on delete set null;

create trigger tg_club_feed_posts_updated
  before update on public.club_feed_posts
  for each row execute function public.tg_set_updated_at();

-- ── 5) Notificación sorteo publicado ─────────────────────────────────────────

insert into public.notification_kinds (kind, description, allowed_roles, default_channels, category)
values
  ('giveaway_started', 'Nuevo sorteo del club', array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'clubs')
on conflict (kind) do update set
  description = excluded.description,
  allowed_roles = excluded.allowed_roles,
  default_channels = excluded.default_channels,
  category = excluded.category;

-- ── 6) RLS feed + mecánicas ──────────────────────────────────────────────────

alter table public.club_feed_posts enable row level security;
alter table public.club_giveaway_mechanic_progress enable row level security;

create policy club_feed_posts_public_read on public.club_feed_posts
  for select using (true);

create policy club_feed_posts_staff_write on public.club_feed_posts
  for all using (
    public.fn_is_club_comms_staff(club_id, auth.uid())
  )
  with check (
    public.fn_is_club_comms_staff(club_id, auth.uid())
  );

create policy club_giveaway_mech_select on public.club_giveaway_mechanic_progress
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.club_giveaways g
      where g.id = giveaway_id
        and public.fn_is_club_comms_staff(g.club_id, auth.uid())
    )
  );

create policy club_giveaway_mech_insert_self on public.club_giveaway_mechanic_progress
  for insert with check (user_id = auth.uid());

-- ── 7) Realtime ──────────────────────────────────────────────────────────────

do $$
declare
  _tables text[] := array['club_feed_posts', 'club_giveaway_mechanic_progress'];
  _t text;
begin
  foreach _t in array _tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = _t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', _t);
    end if;
  end loop;
end $$;
