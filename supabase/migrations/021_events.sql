-- 021 · Events + registrations + check-ins.
-- partner_orgs FK added in 026.
-- See 20-database.md §18 and 30-rls.md §4.15.

create table events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id),
  partner_id uuid,
  organizer_id uuid not null references profiles(id),
  name text not null,
  slug text unique not null,
  description text,
  cover_url text,
  kind text not null check (kind in ('social','clinic','exhibition','party','league_meet','other')),
  status mp_event_status not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int,
  price_cents int not null default 0,
  currency mp_currency,
  visibility mp_visibility not null default 'public',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_events_starts on events (starts_at);
create trigger tg_events_updated before update on events
  for each row execute function tg_set_updated_at();

create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  paid_transaction_id uuid references transactions(id),
  status text not null default 'registered' check (status in ('registered','cancelled','attended','no_show')),
  created_at timestamptz default now() not null,
  unique (event_id, user_id)
);

create table event_check_ins (
  event_registration_id uuid primary key references event_registrations(id) on delete cascade,
  checked_in_at timestamptz default now() not null,
  checked_in_by uuid references profiles(id)
);

alter table events enable row level security;
create policy events_public_select on events for select using (
  visibility = 'public' and status in ('published','registration_open','registration_closed','live','finished')
);
create policy events_member_select on events for select using (
  visibility = 'members' and auth.uid() is not null
);
create policy events_organizer_all on events for all using (
  organizer_id = auth.uid() or (club_id is not null and mp_club_staff(club_id))
);

alter table event_registrations enable row level security;
create policy er_self on event_registrations for all using (user_id = auth.uid());
create policy er_organizer_select on event_registrations for select using (
  exists(select 1 from events e where e.id = event_id and
         (e.organizer_id = auth.uid() or (e.club_id is not null and mp_club_staff(e.club_id))))
);

alter table event_check_ins enable row level security;
create policy eci_organizer on event_check_ins for all using (
  exists(select 1 from event_registrations er join events e on e.id = er.event_id
         where er.id = event_registration_id
           and (e.organizer_id = auth.uid() or (e.club_id is not null and mp_club_staff(e.club_id))))
);
