-- 007 · Audit log + reusable audit trigger.
-- See docs/architecture/20-database.md §0 and §21.
-- Apply tg_audit to a table with:
--   create trigger tg_audit_<table> after insert or update or delete on <table>
--     for each row execute function tg_audit();

create table audit_log (
  id bigserial primary key,
  actor_id uuid references profiles(id),
  actor_role text,
  club_id uuid,
  entity text not null,
  entity_id uuid,
  action text not null,
  diff jsonb,
  ip inet,
  ua text,
  created_at timestamptz default now() not null
);

create index idx_audit_log_entity on audit_log (entity, entity_id, created_at desc);
create index idx_audit_log_club on audit_log (club_id, created_at desc);
create index idx_audit_log_actor on audit_log (actor_id, created_at desc);

create or replace function tg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  _actor uuid := auth.uid();
  _role text := coalesce(current_setting('app.active_role', true), 'system');
  _club uuid := nullif(current_setting('app.active_club_id', true), '')::uuid;
  _entity_id uuid;
  _diff jsonb;
begin
  _entity_id := coalesce(
    (case when tg_op = 'DELETE' then (old).id else (new).id end)::uuid,
    null
  );

  _diff := case tg_op
    when 'INSERT' then to_jsonb(new)
    when 'DELETE' then to_jsonb(old)
    when 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
  end;

  insert into audit_log (actor_id, actor_role, club_id, entity, entity_id, action, diff)
  values (_actor, _role, _club, tg_table_name, _entity_id, tg_op, _diff);

  return coalesce(new, old);
end $$;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table audit_log enable row level security;

create policy audit_admin_select on audit_log for select using (mp_is_admin());
create policy audit_owner_select on audit_log for select
  using (club_id is not null and mp_is_owner_of(club_id));

revoke insert, update, delete on audit_log from authenticated, anon;
