-- 008 · Reservations + walkins. See 20-database.md §5, 30-rls.md §4.4.

create table reservations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  court_id uuid not null references courts(id),
  during tstzrange not null,
  status mp_reservation_status not null default 'booked',
  sport mp_sport not null,
  visibility mp_visibility not null default 'private',
  max_players int not null default 4,
  notes text,
  organizer_id uuid not null references profiles(id),
  source text not null default 'app' check (source in ('app','walkin','admin','recurring')),
  cancellation_reason text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  cancelled_at timestamptz,
  exclude using gist (court_id with =, during with &&)
    where (status not in ('cancelled'))
);
create index idx_reservations_club on reservations (club_id, during);
create index idx_reservations_organizer on reservations (organizer_id);
create trigger tg_reservations_updated before update on reservations
  for each row execute function tg_set_updated_at();

create table reservation_participants (
  reservation_id uuid not null references reservations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  invited_by uuid references profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','removed')),
  joined_at timestamptz,
  primary key (reservation_id, user_id)
);

create table reservation_payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  user_id uuid references profiles(id),
  amount_cents int not null,
  currency mp_currency not null,
  method mp_payment_method not null,
  status mp_payment_status not null default 'pending',
  transaction_id uuid, -- FK added in 010_cash.sql
  created_at timestamptz default now() not null
);

create table walkins (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  court_id uuid references courts(id),
  customer_name text not null,
  customer_phone text,
  party_size int not null default 2,
  duration_minutes int not null default 60,
  created_reservation_id uuid references reservations(id),
  attended_by uuid references profiles(id),
  created_at timestamptz default now() not null
);

-- RLS
alter table reservations enable row level security;

create policy res_select on reservations for select using (
  organizer_id = auth.uid()
  or visibility = 'public'
  or mp_club_staff(club_id)
  or mp_is_employee_of(club_id)
  or exists(select 1 from reservation_participants p
            where p.reservation_id = reservations.id and p.user_id = auth.uid())
);

create policy res_insert_user on reservations for insert
  with check (organizer_id = auth.uid() and source = 'app');

create policy res_insert_staff on reservations for insert
  with check (mp_club_staff(club_id) or mp_is_employee_of(club_id));

create policy res_update on reservations for update using (
  (organizer_id = auth.uid() and status in ('booked','confirmed'))
  or mp_club_staff(club_id)
  or mp_is_employee_of(club_id)
);

create policy res_delete_admin on reservations for delete using (mp_is_admin());

alter table reservation_participants enable row level security;
create policy rp_select on reservation_participants for select using (
  user_id = auth.uid()
  or exists(select 1 from reservations r
            where r.id = reservation_id
              and (r.organizer_id = auth.uid() or mp_club_staff(r.club_id)))
);
create policy rp_join_self on reservation_participants for insert with check (
  user_id = auth.uid()
  and exists(select 1 from reservations r
             where r.id = reservation_id and r.visibility = 'public')
);
create policy rp_organizer_invite on reservation_participants for insert with check (
  exists(select 1 from reservations r where r.id = reservation_id and r.organizer_id = auth.uid())
);
create policy rp_leave on reservation_participants for delete using (user_id = auth.uid());

alter table reservation_payments enable row level security;
create policy resp_visible on reservation_payments for select using (
  user_id = auth.uid()
  or exists(select 1 from reservations r where r.id = reservation_id
            and (r.organizer_id = auth.uid() or mp_club_staff(r.club_id)))
);
create policy resp_staff_write on reservation_payments for all using (
  exists(select 1 from reservations r where r.id = reservation_id and mp_club_staff(r.club_id))
);

alter table walkins enable row level security;
create policy walkins_staff on walkins for all using (
  mp_club_staff(club_id) or mp_is_employee_of(club_id)
);
