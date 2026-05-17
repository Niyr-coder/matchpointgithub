-- 027 · Feature flags.
-- See 20-database.md §23 and 30-rls.md §4.20.

create table feature_flags (
  key text primary key,
  description text not null,
  enabled_default boolean not null default false,
  rollout_pct int not null default 0 check (rollout_pct between 0 and 100),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create trigger tg_feature_flags_updated before update on feature_flags
  for each row execute function tg_set_updated_at();

create table feature_flag_assignments (
  flag_key text not null references feature_flags(key) on delete cascade,
  scope text not null check (scope in ('user','club','role')),
  scope_id text not null,
  enabled boolean not null,
  reason text,
  primary key (flag_key, scope, scope_id)
);

alter table feature_flags enable row level security;
create policy ff_authn_select on feature_flags for select using (auth.uid() is not null);
create policy ff_admin_all on feature_flags for all using (mp_is_admin());

alter table feature_flag_assignments enable row level security;
create policy ffa_admin_all on feature_flag_assignments for all using (mp_is_admin());

create or replace function fn_my_effective_flags() returns table(key text, enabled boolean)
language sql security definer set search_path = public as $$
  with my_roles as (
    select distinct role from role_assignments
    where user_id = auth.uid() and revoked_at is null
  ),
  my_clubs as (
    select distinct club_id::text as id from role_assignments
    where user_id = auth.uid() and revoked_at is null and club_id is not null
  )
  select f.key,
    coalesce(
      (select enabled from feature_flag_assignments where flag_key = f.key and scope = 'user' and scope_id = auth.uid()::text),
      (select bool_or(enabled) from feature_flag_assignments
       where flag_key = f.key and scope = 'club' and scope_id in (select id from my_clubs)),
      (select bool_or(enabled) from feature_flag_assignments
       where flag_key = f.key and scope = 'role' and scope_id in (select role::text from my_roles)),
      f.enabled_default
    )
  from feature_flags f;
$$;
grant execute on function fn_my_effective_flags() to authenticated;
