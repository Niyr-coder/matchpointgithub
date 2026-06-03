-- Club comunicación: club_channel (VIP + staff) + club_announcements (followers)
-- + giveaways acoplados al canal de anuncios.

-- ── 1) Kinds de conversación y mensajes ─────────────────────────────────────

alter table public.conversations
  drop constraint if exists conversations_kind_check;
alter table public.conversations
  add constraint conversations_kind_check
  check (kind in (
    'dm','group','support','club_channel','club_announcements',
    'team_channel','match','quedada'
  ));

create unique index if not exists ux_conversations_club_channel
  on public.conversations (club_id)
  where kind = 'club_channel' and club_id is not null;

create unique index if not exists ux_conversations_club_announcements
  on public.conversations (club_id)
  where kind = 'club_announcements' and club_id is not null;

alter table public.messages
  drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check
  check (kind in (
    'text','image','file','system','reservation_invite',
    'announcement_post','giveaway_post','giveaway_result'
  ));

-- ── 2) Giveaways ────────────────────────────────────────────────────────────

create table if not exists public.club_giveaways (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  title text not null,
  description text,
  prize_label text not null,
  eligibility text not null default 'followers'
    check (eligibility in ('followers','members','all')),
  status text not null default 'draft'
    check (status in ('draft','open','closed','drawn','cancelled')),
  max_winners int not null default 1 check (max_winners >= 1 and max_winners <= 20),
  opens_at timestamptz,
  closes_at timestamptz,
  drawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_club_giveaways_club_status
  on public.club_giveaways (club_id, status, created_at desc);

create table if not exists public.club_giveaway_entries (
  giveaway_id uuid not null references public.club_giveaways(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entered_at timestamptz not null default now(),
  primary key (giveaway_id, user_id)
);

create index if not exists idx_club_giveaway_entries_user
  on public.club_giveaway_entries (user_id, entered_at desc);

create table if not exists public.club_giveaway_winners (
  giveaway_id uuid not null references public.club_giveaways(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rank int not null default 1 check (rank >= 1),
  notified_at timestamptz,
  primary key (giveaway_id, user_id)
);

create trigger tg_club_giveaways_updated
  before update on public.club_giveaways
  for each row execute function public.tg_set_updated_at();

-- ── 3) Helpers de elegibilidad / sync ───────────────────────────────────────

create or replace function public.fn_is_club_vip_active(p_club_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_memberships cm
    where cm.club_id = p_club_id
      and cm.user_id = p_user_id
      and cm.status = 'active'
      and (cm.expires_at is null or cm.expires_at > now())
  );
$$;

create or replace function public.fn_is_club_follower(p_club_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_followers cf
    where cf.club_id = p_club_id and cf.user_id = p_user_id
  );
$$;

create or replace function public.fn_is_club_comms_staff(p_club_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.club_id = p_club_id
      and ra.user_id = p_user_id
      and ra.role in ('owner','manager','coach','employee')
      and ra.revoked_at is null
  );
$$;

create or replace function public.fn_is_club_announcements_publisher(p_club_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.role_assignments ra
    where ra.club_id = p_club_id
      and ra.user_id = p_user_id
      and ra.role in ('owner','manager')
      and ra.revoked_at is null
  );
$$;

create or replace function public.fn_ensure_club_channels(p_club_id uuid)
returns table (community_id uuid, announcements_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_owner uuid;
  v_comm uuid;
  v_ann uuid;
begin
  select c.name into v_name from public.clubs c where c.id = p_club_id;

  select coalesce(
    (select ra.user_id from public.role_assignments ra
      inner join public.profiles p on p.id = ra.user_id
      where ra.club_id = p_club_id and ra.role = 'owner' and ra.revoked_at is null
      order by ra.granted_at asc limit 1),
    (select c.applied_by from public.clubs c
      inner join public.profiles p on p.id = c.applied_by
      where c.id = p_club_id)
  ) into v_owner;

  if v_name is null or v_owner is null then
    return;
  end if;

  select id into v_comm
  from public.conversations
  where club_id = p_club_id and kind = 'club_channel'
  limit 1;

  if v_comm is null then
    insert into public.conversations (kind, title, club_id, created_by)
    values ('club_channel', 'Comunidad · ' || v_name, p_club_id, v_owner)
    returning id into v_comm;
  end if;

  select id into v_ann
  from public.conversations
  where club_id = p_club_id and kind = 'club_announcements'
  limit 1;

  if v_ann is null then
    insert into public.conversations (kind, title, club_id, created_by)
    values ('club_announcements', 'Anuncios · ' || v_name, p_club_id, v_owner)
    returning id into v_ann;
  end if;

  community_id := v_comm;
  announcements_id := v_ann;
  return next;
end;
$$;

create or replace function public.fn_club_comms_upsert_member(
  p_conversation_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conversation_members (conversation_id, user_id, role)
  values (p_conversation_id, p_user_id, p_role)
  on conflict (conversation_id, user_id) do update
    set left_at = null,
        role = excluded.role;
end;
$$;

create or replace function public.fn_club_comms_leave(
  p_conversation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_members
  set left_at = now()
  where conversation_id = p_conversation_id
    and user_id = p_user_id
    and left_at is null;
end;
$$;

create or replace function public.fn_club_comms_sync_user(p_club_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comm uuid;
  v_ann uuid;
  v_staff boolean;
  v_follower boolean;
  v_vip boolean;
  v_role text;
begin
  select community_id, announcements_id
  into v_comm, v_ann
  from public.fn_ensure_club_channels(p_club_id)
  limit 1;

  if v_comm is null or v_ann is null then
    return;
  end if;

  v_staff := public.fn_is_club_comms_staff(p_club_id, p_user_id);
  v_follower := public.fn_is_club_follower(p_club_id, p_user_id);
  v_vip := public.fn_is_club_vip_active(p_club_id, p_user_id);
  v_role := case when v_staff then 'admin' else 'member' end;

  if v_follower or v_vip or v_staff then
    perform public.fn_club_comms_upsert_member(v_ann, p_user_id, v_role);
  else
    perform public.fn_club_comms_leave(v_ann, p_user_id);
  end if;

  if v_vip or v_staff then
    perform public.fn_club_comms_upsert_member(v_comm, p_user_id, v_role);
  else
    perform public.fn_club_comms_leave(v_comm, p_user_id);
  end if;
end;
$$;

create or replace function public.fn_club_comms_sync_all(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  perform public.fn_ensure_club_channels(p_club_id);

  for v_user in
    select user_id from public.club_followers where club_id = p_club_id
    union
    select user_id from public.club_memberships where club_id = p_club_id
    union
    select user_id from public.role_assignments
      where club_id = p_club_id and revoked_at is null
  loop
    perform public.fn_club_comms_sync_user(p_club_id, v_user);
  end loop;
end;
$$;

-- ── 4) Triggers ───────────────────────────────────────────────────────────────

create or replace function public.fn_club_created_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_ensure_club_channels(new.id);
  return new;
end;
$$;

drop trigger if exists tg_club_created_channels on public.clubs;
create trigger tg_club_created_channels
  after insert on public.clubs
  for each row execute function public.fn_club_created_channels();

create or replace function public.fn_club_follower_comms_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.fn_club_comms_sync_user(new.club_id, new.user_id);
  elsif tg_op = 'DELETE' then
    perform public.fn_club_comms_sync_user(old.club_id, old.user_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists tg_club_follower_comms_sync on public.club_followers;
create trigger tg_club_follower_comms_sync
  after insert or delete on public.club_followers
  for each row execute function public.fn_club_follower_comms_sync();

create or replace function public.fn_club_membership_comms_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_club_comms_sync_user(new.club_id, new.user_id);
  return new;
end;
$$;

drop trigger if exists tg_club_membership_comms_sync on public.club_memberships;
create trigger tg_club_membership_comms_sync
  after insert or update of status, expires_at on public.club_memberships
  for each row execute function public.fn_club_membership_comms_sync();

create or replace function public.fn_role_assignment_comms_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club uuid;
  v_user uuid;
begin
  if tg_op = 'DELETE' then
    v_club := old.club_id;
    v_user := old.user_id;
  else
    v_club := new.club_id;
    v_user := new.user_id;
  end if;

  if v_club is not null and v_user is not null then
    perform public.fn_club_comms_sync_user(v_club, v_user);
  end if;

  if tg_op = 'UPDATE' and old.club_id is distinct from new.club_id then
    if old.club_id is not null then
      perform public.fn_club_comms_sync_user(old.club_id, old.user_id);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists tg_role_assignment_comms_sync on public.role_assignments;
create trigger tg_role_assignment_comms_sync
  after insert or update of revoked_at, club_id or delete on public.role_assignments
  for each row execute function public.fn_role_assignment_comms_sync();

-- Cron membresías: al expirar, re-sync canal comunidad
create or replace function public.fn_process_club_memberships()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _m record;
  _expired record;
begin
  for _expired in
    select club_id, user_id
    from public.club_memberships
    where status = 'active'
      and expires_at is not null
      and expires_at < now()
  loop
    update public.club_memberships
      set status = 'expired', updated_at = now()
    where club_id = _expired.club_id
      and user_id = _expired.user_id
      and status = 'active';
    perform public.fn_club_comms_sync_user(_expired.club_id, _expired.user_id);
  end loop;

  for _m in
    select cm.id, cm.user_id, cm.expires_at,
           coalesce(t.name, 'VIP') as tier_name,
           coalesce(c.name, '') as club_name
      from public.club_memberships cm
      left join public.club_membership_tiers t on t.id = cm.tier_id
      left join public.clubs c on c.id = cm.club_id
     where cm.status = 'active'
       and cm.expires_at is not null
       and cm.expires_at >= now()
       and cm.expires_at <= now() + interval '7 days'
  loop
    if not exists (
      select 1 from public.notification_jobs j
       where j.kind = 'club_membership_expiring_soon'
         and j.payload ->> 'membership_id' = _m.id::text
         and j.status in ('pending','sent')
         and j.created_at >= now() - interval '7 days'
    ) then
      insert into public.notification_jobs (user_id, role, kind, channel, payload, status)
      values (
        _m.user_id, 'user'::mp_role, 'club_membership_expiring_soon', 'inapp'::mp_notification_channel,
        jsonb_build_object(
          'membership_id', _m.id,
          'tier_name', _m.tier_name,
          'club_name', _m.club_name,
          'expires_at', _m.expires_at,
          'days_remaining', extract(day from (_m.expires_at - now()))::int
        ),
        'pending'
      );
    end if;
  end loop;
end;
$$;

-- Backfill clubs existentes (tolerante a clubs sin owner válido en profiles)
do $$
declare
  _club uuid;
begin
  for _club in select id from public.clubs loop
    begin
      perform public.fn_club_comms_sync_all(_club);
    exception when others then
      raise notice 'club_comms backfill skip %: %', _club, sqlerrm;
    end;
  end loop;
end;
$$;

-- ── 5) RLS giveaways + anuncios read-only ───────────────────────────────────

alter table public.club_giveaways enable row level security;
alter table public.club_giveaway_entries enable row level security;
alter table public.club_giveaway_winners enable row level security;

create policy club_giveaways_member_select on public.club_giveaways
  for select using (
    public.fn_is_club_announcements_publisher(club_id, auth.uid())
    or exists (
      select 1 from public.conversation_members cm
      join public.conversations c on c.id = cm.conversation_id
      where c.club_id = club_giveaways.club_id
        and c.kind = 'club_announcements'
        and cm.user_id = auth.uid()
        and cm.left_at is null
    )
  );

create policy club_giveaways_staff_write on public.club_giveaways
  for all using (public.fn_is_club_announcements_publisher(club_id, auth.uid()))
  with check (public.fn_is_club_announcements_publisher(club_id, auth.uid()));

create policy club_giveaway_entries_select on public.club_giveaway_entries
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.club_giveaways g
      where g.id = giveaway_id
        and public.fn_is_club_announcements_publisher(g.club_id, auth.uid())
    )
  );

create policy club_giveaway_entries_self_insert on public.club_giveaway_entries
  for insert with check (user_id = auth.uid());

create policy club_giveaway_winners_select on public.club_giveaway_winners
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.club_giveaways g
      where g.id = giveaway_id
        and (
          public.fn_is_club_announcements_publisher(g.club_id, auth.uid())
          or exists (
            select 1 from public.conversation_members cm
            where cm.conversation_id = g.conversation_id
              and cm.user_id = auth.uid()
              and cm.left_at is null
          )
        )
    )
  );

create policy club_giveaway_winners_staff_write on public.club_giveaway_winners
  for all using (
    exists (
      select 1 from public.club_giveaways g
      where g.id = giveaway_id
        and public.fn_is_club_announcements_publisher(g.club_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.club_giveaways g
      where g.id = giveaway_id
        and public.fn_is_club_announcements_publisher(g.club_id, auth.uid())
    )
  );

drop policy if exists messages_club_announcements_staff_only on public.messages;
create policy messages_club_announcements_staff_only on public.messages
  as restrictive
  for insert
  with check (
    not exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.kind = 'club_announcements'
    )
    or public.fn_is_club_announcements_publisher(
      (select c.club_id from public.conversations c where c.id = messages.conversation_id limit 1),
      auth.uid()
    )
  );

-- ── 6) Notificaciones ───────────────────────────────────────────────────────

insert into public.notification_kinds (kind, description, allowed_roles, default_channels, category)
values
  ('club_announcement_new', 'Nuevo anuncio del club', array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'clubs'),
  ('club_membership_chat_welcome', 'Bienvenida al chat del club', array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'clubs'),
  ('giveaway_won', 'Ganaste un sorteo del club', array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'clubs'),
  ('giveaway_drawn', 'Sorteo del club finalizado', array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'clubs')
on conflict (kind) do update set
  description = excluded.description,
  allowed_roles = excluded.allowed_roles,
  default_channels = excluded.default_channels,
  category = excluded.category;

grant execute on function public.fn_is_club_announcements_publisher(uuid, uuid) to authenticated;
grant execute on function public.fn_is_club_vip_active(uuid, uuid) to authenticated;
grant execute on function public.fn_is_club_follower(uuid, uuid) to authenticated;

-- Realtime
do $$
declare
  _table text;
  _tables text[] := array['club_giveaways','club_giveaway_entries','club_giveaway_winners'];
begin
  foreach _table in array _tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = _table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', _table);
    end if;
  end loop;
end;
$$;
