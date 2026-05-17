-- 016 · Messaging (conversations + messages).
-- See 20-database.md §13 and 30-rls.md §4.10.

create table conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm','group','support','club_channel')),
  title text,
  club_id uuid references clubs(id),
  created_by uuid not null references profiles(id),
  last_message_at timestamptz,
  created_at timestamptz default now() not null
);

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin')),
  muted_until timestamptz,
  last_read_message_id uuid,
  joined_at timestamptz default now() not null,
  left_at timestamptz,
  primary key (conversation_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text,
  kind text not null default 'text' check (kind in ('text','image','file','system','reservation_invite')),
  payload jsonb,
  reply_to_id uuid references messages(id),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz default now() not null
);
create index idx_messages_conv_time on messages (conversation_id, created_at desc);

create table message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes bigint
);

create table message_reads (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz default now() not null,
  primary key (message_id, user_id)
);

-- last_message_at maintained by trigger
create or replace function tg_messages_bump_conv() returns trigger
language plpgsql as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger tg_messages_bump after insert on messages
  for each row execute function tg_messages_bump_conv();

alter table conversations enable row level security;
create policy conv_member_select on conversations for select using (
  exists(select 1 from conversation_members cm
         where cm.conversation_id = id and cm.user_id = auth.uid() and cm.left_at is null)
);
create policy conv_creator_insert on conversations for insert with check (created_by = auth.uid());
create policy conv_admin_update on conversations for update using (
  exists(select 1 from conversation_members cm
         where cm.conversation_id = id and cm.user_id = auth.uid() and cm.role = 'admin')
);

alter table conversation_members enable row level security;
create policy cm_self_select on conversation_members for select using (user_id = auth.uid());
create policy cm_member_select on conversation_members for select using (
  exists(select 1 from conversation_members me
         where me.conversation_id = conversation_members.conversation_id and me.user_id = auth.uid())
);
create policy cm_admin_invite on conversation_members for insert with check (
  exists(select 1 from conversation_members me
         where me.conversation_id = conversation_members.conversation_id
           and me.user_id = auth.uid() and me.role = 'admin')
);
create policy cm_self_leave on conversation_members for update using (user_id = auth.uid());

alter table messages enable row level security;
create policy messages_member_select on messages for select using (
  exists(select 1 from conversation_members cm
         where cm.conversation_id = messages.conversation_id
           and cm.user_id = auth.uid() and cm.left_at is null)
);
create policy messages_member_insert on messages for insert with check (
  sender_id = auth.uid() and exists(
    select 1 from conversation_members cm
    where cm.conversation_id = messages.conversation_id
      and cm.user_id = auth.uid() and cm.left_at is null
  )
);
create policy messages_owner_update on messages for update
  using (sender_id = auth.uid() and created_at > now() - interval '15 min');
create policy messages_owner_delete on messages for delete using (sender_id = auth.uid());
create policy messages_admin_all on messages for all using (mp_is_admin());

alter table message_attachments enable row level security;
create policy ma_visible on message_attachments for select using (
  exists(select 1 from messages m
         join conversation_members cm on cm.conversation_id = m.conversation_id
         where m.id = message_id and cm.user_id = auth.uid())
);

alter table message_reads enable row level security;
create policy mr_self on message_reads for all using (user_id = auth.uid());
