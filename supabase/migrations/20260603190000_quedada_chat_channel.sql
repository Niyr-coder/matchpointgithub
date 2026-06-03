-- Chat grupal por quedada (kind=quedada). Se abre al cerrar inscripciones.

alter table public.conversations
  drop constraint if exists conversations_kind_check;
alter table public.conversations
  add constraint conversations_kind_check
  check (kind in ('dm','group','support','club_channel','team_channel','match','quedada'));

alter table public.conversations
  add column if not exists quedada_id uuid references public.quedadas(id) on delete cascade;

create unique index if not exists idx_conversations_quedada_unique
  on public.conversations (quedada_id)
  where quedada_id is not null;

comment on column public.conversations.quedada_id is
  'Para kind=quedada: referencia al juego social. Cascade on quedada delete.';

create or replace function public.fn_ensure_quedada_channel(p_quedada_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
  v_title text;
  v_creator uuid;
  v_user uuid;
begin
  select id into v_conv_id
  from public.conversations
  where quedada_id = p_quedada_id
  limit 1;

  select title, creator_id into v_title, v_creator
  from public.quedadas
  where id = p_quedada_id;

  if v_title is null or v_creator is null then
    return null;
  end if;

  if v_conv_id is null then
    insert into public.conversations (kind, title, quedada_id, created_by)
    values ('quedada', v_title, p_quedada_id, v_creator)
    returning id into v_conv_id;
  else
    update public.conversations
    set title = v_title
    where id = v_conv_id and title is distinct from v_title;
  end if;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conv_id, v_creator, 'admin')
  on conflict (conversation_id, user_id) do nothing;

  for v_user in
    select user_id from public.quedada_cohosts where quedada_id = p_quedada_id
  loop
    insert into public.conversation_members (conversation_id, user_id, role)
    values (v_conv_id, v_user, 'admin')
    on conflict (conversation_id, user_id) do nothing;
  end loop;

  for v_user in
    select user_id
    from public.quedada_participants
    where quedada_id = p_quedada_id and status = 'joined'
  loop
    insert into public.conversation_members (conversation_id, user_id, role)
    values (
      v_conv_id,
      v_user,
      case when v_user = v_creator then 'admin' else 'member' end
    )
    on conflict (conversation_id, user_id) do nothing;
  end loop;

  return v_conv_id;
end;
$$;

comment on function public.fn_ensure_quedada_channel(uuid) is
  'Crea o sincroniza el chat kind=quedada con creador, co-hosts e inscritos joined.';

create or replace function public.fn_quedada_chat_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('registration_closed', 'live', 'finished')
     and old.status is distinct from new.status then
    perform public.fn_ensure_quedada_channel(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists tg_quedada_chat_on_status on public.quedadas;
create trigger tg_quedada_chat_on_status
  after update of status on public.quedadas
  for each row
  execute function public.fn_quedada_chat_on_status();
