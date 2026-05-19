-- 106 · Triggers que sincronizan teams ↔ conversations (team_channel)
-- Ver docs/architecture/20-database.md §29.13.
--
-- 1) AFTER insert on teams: crea conversation team_channel + agrega captain.
-- 2) AFTER insert on team_members: agrega user a conversation_members.
-- 3) AFTER delete on team_members: marca left_at (preserva historial).
-- 4) DELETE de conversation al borrar team: FK on delete cascade (mig 104).

-- 1) Crear team_channel al crear team
create or replace function fn_create_team_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
begin
  insert into public.conversations (kind, title, team_id, created_by)
  values (
    'team_channel',
    'Equipo ' || coalesce(new.name, ''),
    new.id,
    new.captain_id
  )
  returning id into v_conv_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conv_id, new.captain_id, 'admin');

  return new;
end;
$$;

drop trigger if exists tg_team_channel_create on public.teams;
create trigger tg_team_channel_create
  after insert on public.teams
  for each row execute function fn_create_team_channel();

-- 2) Agregar miembros al team_channel cuando entran al team
create or replace function fn_team_member_join_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
  v_existing uuid;
begin
  select id into v_conv_id
  from public.conversations
  where team_id = new.team_id and kind = 'team_channel'
  limit 1;

  if v_conv_id is null then
    return new;
  end if;

  select user_id into v_existing
  from public.conversation_members
  where conversation_id = v_conv_id and user_id = new.user_id
  limit 1;

  if v_existing is not null then
    update public.conversation_members
    set left_at = null
    where conversation_id = v_conv_id and user_id = new.user_id;
  else
    insert into public.conversation_members (conversation_id, user_id, role)
    values (
      v_conv_id,
      new.user_id,
      case when new.role = 'captain' then 'admin' else 'member' end
    )
    on conflict (conversation_id, user_id) do update set left_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists tg_team_member_join_channel on public.team_members;
create trigger tg_team_member_join_channel
  after insert on public.team_members
  for each row execute function fn_team_member_join_channel();

-- 3) Marcar left_at cuando el user sale del team
create or replace function fn_team_member_leave_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
begin
  select id into v_conv_id
  from public.conversations
  where team_id = old.team_id and kind = 'team_channel'
  limit 1;

  if v_conv_id is null then
    return old;
  end if;

  update public.conversation_members
  set left_at = now()
  where conversation_id = v_conv_id and user_id = old.user_id
    and left_at is null;

  return old;
end;
$$;

drop trigger if exists tg_team_member_leave_channel on public.team_members;
create trigger tg_team_member_leave_channel
  after delete on public.team_members
  for each row execute function fn_team_member_leave_channel();
