-- 022 · Notifications (role-aware).
-- See 20-database.md §19 and 30-rls.md §4.16.

create table notification_kinds (
  kind text primary key,
  description text not null,
  allowed_roles mp_role[] not null,
  default_channels mp_notification_channel[] not null,
  category text not null,
  created_at timestamptz default now() not null
);

create table notification_preferences (
  user_id uuid not null references profiles(id) on delete cascade,
  role mp_role not null,
  kind text not null references notification_kinds(kind),
  channel mp_notification_channel not null,
  enabled boolean not null default true,
  primary key (user_id, role, kind, channel)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references profiles(id) on delete cascade,
  recipient_role mp_role not null,
  kind text not null references notification_kinds(kind),
  title text not null,
  body text,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz default now() not null
);
create index idx_notifications_user_role_unread
  on notifications (recipient_user_id, recipient_role, created_at desc)
  where read_at is null;
create index idx_notifications_user_role
  on notifications (recipient_user_id, recipient_role, created_at desc);

create table notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz default now() not null,
  unique (user_id, endpoint)
);

create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null references notification_kinds(kind),
  channel mp_notification_channel not null,
  locale text not null default 'es',
  subject text,
  body_template text not null,
  unique (kind, channel, locale)
);

create table notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role mp_role not null,
  kind text not null references notification_kinds(kind),
  channel mp_notification_channel not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempts int not null default 0,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz default now() not null
);
create index idx_notification_jobs_pending on notification_jobs (scheduled_for) where status = 'pending';

-- unread count view (bell badge)
create view v_unread_notifications as
  select recipient_user_id, recipient_role, count(*)::int as unread
  from notifications
  where read_at is null
  group by recipient_user_id, recipient_role;
grant select on v_unread_notifications to authenticated;

-- RLS
alter table notification_kinds enable row level security;
create policy nkinds_public_select on notification_kinds for select using (true);
create policy nkinds_admin_write on notification_kinds for all using (mp_is_admin());

alter table notification_preferences enable row level security;
create policy nprefs_self on notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table notifications enable row level security;
create policy notif_self_active_role on notifications for select using (
  recipient_user_id = auth.uid()
  and (mp_active_role() is null or recipient_role = mp_active_role()::mp_role)
);
create policy notif_mark_read on notifications for update
  using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());
-- INSERT solo via SECURITY DEFINER enqueue functions / service role
revoke insert, delete on notifications from authenticated, anon;

alter table notification_subscriptions enable row level security;
create policy nsubs_self on notification_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table notification_templates enable row level security;
create policy ntmpl_authn_select on notification_templates for select using (auth.uid() is not null);
create policy ntmpl_admin_write on notification_templates for all using (mp_is_admin());

alter table notification_jobs enable row level security;
create policy njobs_admin_all on notification_jobs for all using (mp_is_admin());

-- SECURITY DEFINER enqueue
create or replace function fn_enqueue_notification(
  p_user_id uuid,
  p_role mp_role,
  p_kind text,
  p_title text,
  p_body text default null,
  p_payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare _kind notification_kinds%rowtype;
        _notif_id uuid;
        _ch mp_notification_channel;
begin
  select * into _kind from notification_kinds where kind = p_kind;
  if _kind is null then
    raise exception 'unknown notification kind %', p_kind;
  end if;
  if not (p_role = any(_kind.allowed_roles)) then
    raise exception 'role % not allowed for kind %', p_role, p_kind;
  end if;

  insert into notifications (recipient_user_id, recipient_role, kind, title, body, payload)
  values (p_user_id, p_role, p_kind, p_title, p_body, p_payload)
  returning id into _notif_id;

  -- enqueue jobs for each default channel that user hasn't disabled
  foreach _ch in array _kind.default_channels loop
    if not exists(
      select 1 from notification_preferences
      where user_id = p_user_id and role = p_role and kind = p_kind
        and channel = _ch and enabled = false
    ) then
      insert into notification_jobs (user_id, role, kind, channel, payload)
      values (p_user_id, p_role, p_kind, _ch,
              jsonb_build_object('notification_id', _notif_id, 'title', p_title, 'body', p_body) || p_payload);
    end if;
  end loop;

  return _notif_id;
end $$;
