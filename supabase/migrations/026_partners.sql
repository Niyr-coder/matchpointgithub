-- 026 · Partner federations + revenue share.
-- See 20-database.md §24 and 30-rls.md §4.21.

create table partner_orgs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  logo_url text,
  country text,
  contact_email text,
  status text not null default 'active' check (status in ('pending','active','suspended','archived')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create trigger tg_partner_orgs_updated before update on partner_orgs
  for each row execute function tg_set_updated_at();

create table partner_members (
  partner_id uuid not null references partner_orgs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz default now() not null,
  primary key (partner_id, user_id)
);

create table partner_club_links (
  partner_id uuid not null references partner_orgs(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  revenue_share_pct numeric(5,2) not null default 0,
  linked_at timestamptz default now() not null,
  primary key (partner_id, club_id)
);

-- backfill FKs deferred from earlier migrations
alter table role_assignments
  add constraint role_assignments_partner_fk
  foreign key (partner_id) references partner_orgs(id) on delete cascade;

alter table leagues
  add constraint leagues_partner_fk
  foreign key (partner_id) references partner_orgs(id);

alter table tournaments
  add constraint tournaments_partner_fk
  foreign key (partner_id) references partner_orgs(id);

alter table events
  add constraint events_partner_fk
  foreign key (partner_id) references partner_orgs(id);

alter table broadcasts
  add constraint broadcasts_partner_fk
  foreign key (partner_id) references partner_orgs(id);

-- Helper: is user a partner-admin?
create or replace function mp_is_partner_admin_of(p_partner_id uuid) returns boolean
language sql stable as $$
  select exists(
    select 1 from partner_members pm
    where pm.partner_id = p_partner_id and pm.user_id = auth.uid()
      and pm.role in ('owner','admin')
  );
$$;

create or replace function mp_partner_has_club(p_club_id uuid) returns boolean
language sql stable as $$
  select exists(
    select 1 from partner_club_links pcl
    join partner_members pm on pm.partner_id = pcl.partner_id
    where pcl.club_id = p_club_id and pm.user_id = auth.uid()
  );
$$;

-- Late-binding partner write policies for tournaments / leagues / broadcasts
create policy t_partner_write on tournaments for all
  using (partner_id is not null and mp_is_partner_admin_of(partner_id))
  with check (partner_id is not null and mp_is_partner_admin_of(partner_id));

create policy l_partner_write on leagues for all
  using (partner_id is not null and mp_is_partner_admin_of(partner_id))
  with check (partner_id is not null and mp_is_partner_admin_of(partner_id));

create policy bc_partner_write on broadcasts for all
  using (scope = 'partner' and partner_id is not null and mp_is_partner_admin_of(partner_id))
  with check (scope = 'partner' and partner_id is not null and mp_is_partner_admin_of(partner_id));

create policy br_partner_select on brackets for select using (true);
create policy br_partner_write on brackets for all using (
  exists(select 1 from tournaments t
         where t.id = tournament_id and t.partner_id is not null
           and mp_is_partner_admin_of(t.partner_id))
);

create policy bm_partner_write on bracket_matches for all using (
  exists(select 1 from brackets b join tournaments t on t.id = b.tournament_id
         where b.id = bracket_id and t.partner_id is not null
           and mp_is_partner_admin_of(t.partner_id))
);

create policy reg_partner_select on registrations for select using (
  exists(select 1 from tournaments t where t.id = tournament_id and t.partner_id is not null
         and mp_is_partner_admin_of(t.partner_id))
);

create policy reg_partner_decide on registrations for update using (
  exists(select 1 from tournaments t where t.id = tournament_id and t.partner_id is not null
         and mp_is_partner_admin_of(t.partner_id))
);

-- RLS for partner_* tables
alter table partner_orgs enable row level security;
create policy po_member_select on partner_orgs for select using (
  exists(select 1 from partner_members pm where pm.partner_id = id and pm.user_id = auth.uid())
);
create policy po_admin_all on partner_orgs for all using (mp_is_admin());

alter table partner_members enable row level security;
create policy pm_self_select on partner_members for select using (user_id = auth.uid());
create policy pm_partner_admin on partner_members for all using (
  exists(select 1 from partner_members me
         where me.partner_id = partner_members.partner_id
           and me.user_id = auth.uid() and me.role in ('owner','admin'))
);
create policy pm_admin_all on partner_members for all using (mp_is_admin());

alter table partner_club_links enable row level security;
create policy pcl_partner_select on partner_club_links for select using (
  exists(select 1 from partner_members pm where pm.partner_id = partner_club_links.partner_id and pm.user_id = auth.uid())
);
create policy pcl_club_select on partner_club_links for select using (mp_is_owner_of(club_id));
create policy pcl_admin_all on partner_club_links for all using (mp_is_admin());
