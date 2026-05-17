-- 023 · Marketing broadcasts.
-- partner_orgs FK added in 026.
-- See 20-database.md §20 and 30-rls.md §4.17.

create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform','club','partner')),
  club_id uuid references clubs(id),
  partner_id uuid,
  title text not null,
  body text not null,
  payload jsonb default '{}',
  channels mp_notification_channel[] not null default '{inapp}',
  target_filter jsonb not null default '{}',
  scheduled_for timestamptz,
  sent_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','cancelled')),
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null
);

create table broadcast_recipients (
  broadcast_id uuid not null references broadcasts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  notification_id uuid references notifications(id),
  primary key (broadcast_id, user_id)
);

alter table broadcasts enable row level security;
create policy bc_admin_all on broadcasts for all using (mp_is_admin());
create policy bc_owner_club on broadcasts for all
  using (scope = 'club' and club_id is not null and mp_club_staff(club_id))
  with check (scope = 'club' and club_id is not null and mp_club_staff(club_id));

alter table broadcast_recipients enable row level security;
create policy br_admin_select on broadcast_recipients for select using (mp_is_admin());
create policy br_owner_select on broadcast_recipients for select using (
  exists(select 1 from broadcasts b where b.id = broadcast_id
         and ((b.scope = 'club' and b.club_id is not null and mp_club_staff(b.club_id))
              or mp_is_admin()))
);
