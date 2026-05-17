-- 024 · Moderation: reports + moderation_actions (audit_log lives in 007).
-- See 20-database.md §21 and 30-rls.md §4.18.

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id),
  entity text not null,
  entity_id uuid not null,
  reason text not null,
  details text,
  status mp_report_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz default now() not null
);
create index idx_reports_status on reports (status, created_at desc);

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id),
  target_user_id uuid references profiles(id),
  target_entity text,
  target_entity_id uuid,
  action text not null check (action in ('warn','remove_content','suspend','ban','restore','dismiss')),
  duration_hours int,
  reason text not null,
  performed_by uuid not null references profiles(id),
  performed_at timestamptz default now() not null
);

alter table reports enable row level security;
create policy reports_reporter_select on reports for select using (reporter_id = auth.uid());
create policy reports_admin_all on reports for all using (mp_is_admin());
create policy reports_open on reports for insert with check (reporter_id = auth.uid());

alter table moderation_actions enable row level security;
create policy ma_admin_all on moderation_actions for all using (mp_is_admin());
