-- 105 · RPC fn_send_system_message
-- Bypass de messages_member_insert (que requiere sender_id = auth.uid())
-- para que el perfil oficial MATCHPOINT pueda enviar DMs automáticos
-- de bienvenida. SECURITY DEFINER + killswitch via platform_config.
-- Ver docs/guides/02-notifications.md §8 (System messages).

create or replace function fn_send_system_message(
  p_recipient_user_id uuid,
  p_body              text,
  p_payload           jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled       jsonb;
  v_system_id     uuid;
  v_conv_id       uuid;
  v_message_id    uuid;
begin
  -- 1) Killswitch
  select value into v_enabled from public.platform_config where key = 'system_messages_enabled';
  if v_enabled is null or v_enabled::text = 'false' then
    return null;
  end if;

  -- 2) System user id
  v_system_id := fn_get_system_user_id();
  if v_system_id is null then
    raise exception 'system_user_id not configured in platform_config';
  end if;

  if p_recipient_user_id = v_system_id then
    raise exception 'cannot send system message to system user itself';
  end if;

  -- 3) Encontrar DM existente entre system user y recipient
  select c.id into v_conv_id
  from public.conversations c
  where c.kind = 'dm'
    and exists(
      select 1 from public.conversation_members cm1
      where cm1.conversation_id = c.id and cm1.user_id = v_system_id and cm1.left_at is null
    )
    and exists(
      select 1 from public.conversation_members cm2
      where cm2.conversation_id = c.id and cm2.user_id = p_recipient_user_id and cm2.left_at is null
    )
  limit 1;

  -- 4) Si no existe, crear DM
  if v_conv_id is null then
    insert into public.conversations (kind, title, created_by)
    values ('dm', null, v_system_id)
    returning id into v_conv_id;

    insert into public.conversation_members (conversation_id, user_id, role)
    values
      (v_conv_id, v_system_id,        'admin'),
      (v_conv_id, p_recipient_user_id, 'member');
  end if;

  -- 5) Insertar message
  insert into public.messages (
    conversation_id, sender_id, body, kind, payload
  ) values (
    v_conv_id, v_system_id, p_body, 'system', coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_message_id;

  return v_message_id;
end;
$$;

grant execute on function fn_send_system_message(uuid, text, jsonb) to authenticated, service_role;

comment on function fn_send_system_message(uuid, text, jsonb) is
  'Envia un DM desde el perfil MATCHPOINT al user dado. Crea el DM si no existe. Respeta killswitch system_messages_enabled.';
