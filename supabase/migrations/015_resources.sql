-- 015 · Coach resources library.
-- See 20-database.md §12 and 30-rls.md §4.9.

create table resources (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_profiles(id),
  club_id uuid references clubs(id),
  title text not null,
  description text,
  kind text not null check (kind in ('video','article','pdf','plan','exercise','link')),
  cover_url text,
  duration_seconds int,
  level mp_skill_level,
  tags text[] default '{}',
  visibility mp_visibility not null default 'private',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_resources_coach on resources (coach_id);
create index idx_resources_tags on resources using gin (tags);
create trigger tg_resources_updated before update on resources
  for each row execute function tg_set_updated_at();

create table resource_files (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  ordinal int not null default 0
);

create table resource_access (
  resource_id uuid not null references resources(id) on delete cascade,
  user_id uuid references profiles(id),
  class_id uuid references classes(id),
  granted_by uuid not null references profiles(id),
  granted_at timestamptz default now() not null,
  check ((user_id is not null) or (class_id is not null))
);
create index idx_resource_access_resource on resource_access (resource_id);

create table resource_views (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  user_id uuid not null references profiles(id),
  progress_pct int not null default 0 check (progress_pct between 0 and 100),
  viewed_at timestamptz default now() not null
);

alter table resources enable row level security;
create policy resources_coach_write on resources for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy resources_public_select on resources for select using (visibility = 'public');
create policy resources_shared_select on resources for select using (
  exists(
    select 1 from resource_access ra
    where ra.resource_id = resources.id
      and (ra.user_id = auth.uid()
           or exists(select 1 from class_enrollments ce
                     where ce.class_id = ra.class_id
                       and ce.student_id = auth.uid()
                       and ce.status = 'enrolled'))
  )
);

alter table resource_files enable row level security;
create policy rf_visible on resource_files for select using (
  exists(select 1 from resources r where r.id = resource_id and (
    r.coach_id = auth.uid()
    or r.visibility = 'public'
    or exists(select 1 from resource_access ra where ra.resource_id = r.id and ra.user_id = auth.uid())
  ))
);
create policy rf_coach_write on resource_files for all using (
  exists(select 1 from resources r where r.id = resource_id and r.coach_id = auth.uid())
);

alter table resource_access enable row level security;
create policy ra_coach_all on resource_access for all using (
  exists(select 1 from resources r where r.id = resource_id and r.coach_id = auth.uid())
);
create policy ra_user_select on resource_access for select using (user_id = auth.uid());

alter table resource_views enable row level security;
create policy rv_self on resource_views for all using (user_id = auth.uid());
create policy rv_coach_select on resource_views for select using (
  exists(select 1 from resources r where r.id = resource_id and r.coach_id = auth.uid())
);
