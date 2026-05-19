-- 111 · MATCHPOINT: auto-accept friend requests + chat read-only
--
-- 1) Trigger: cuando alguien manda friend_request a un perfil is_system,
--    se acepta automáticamente y se crea la friendship en la misma transacción.
-- 2) RLS RESTRICTIVE: bloquea que un user normal mande messages a un DM
--    cuyo otro miembro es is_system. fn_send_system_message (SECURITY
--    DEFINER) bypassa RLS, así que el system sí puede enviar.

create or replace function fn_auto_accept_system_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to_is_system bool;
  v_a uuid;
  v_b uuid;
begin
  select is_system into v_to_is_system from profiles where id = new.to_user_id;
  if v_to_is_system is not true then
    return new;
  end if;

  new.status := 'accepted';
  new.responded_at := now();

  if new.from_user_id < new.to_user_id then
    v_a := new.from_user_id;
    v_b := new.to_user_id;
  else
    v_a := new.to_user_id;
    v_b := new.from_user_id;
  end if;

  insert into public.friendships (user_a, user_b) values (v_a, v_b)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists tg_auto_accept_system_fr on public.friend_requests;
create trigger tg_auto_accept_system_fr
  before insert on public.friend_requests
  for each row execute function fn_auto_accept_system_friend_request();

drop policy if exists messages_no_send_to_system on public.messages;
create policy messages_no_send_to_system on public.messages
  as restrictive
  for insert
  with check (
    not exists (
      select 1
      from public.conversation_members cm
      join public.profiles p on p.id = cm.user_id
      where cm.conversation_id = messages.conversation_id
        and p.is_system = true
        and cm.user_id <> messages.sender_id
    )
  );
