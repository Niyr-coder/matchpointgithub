-- Mensajes de sistema en el chat grupal de quedada (kind=quedada).

create or replace function public.fn_post_quedada_channel_message(
  p_quedada_id uuid,
  p_body text,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
  v_system_id uuid;
  v_message_id uuid;
  v_status text;
begin
  select status into v_status from public.quedadas where id = p_quedada_id;
  if v_status is null or v_status = 'registration_open' then
    return null;
  end if;

  v_conv_id := public.fn_ensure_quedada_channel(p_quedada_id);
  if v_conv_id is null then
    return null;
  end if;

  v_system_id := public.fn_get_system_user_id();
  if v_system_id is null then
    return null;
  end if;

  insert into public.messages (conversation_id, sender_id, body, kind, payload)
  values (
    v_conv_id,
    v_system_id,
    p_body,
    'system',
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('quedada_event', true)
  )
  returning id into v_message_id;

  return v_message_id;
end;
$$;

grant execute on function public.fn_post_quedada_channel_message(uuid, text, jsonb) to authenticated, service_role;

comment on function public.fn_post_quedada_channel_message(uuid, text, jsonb) is
  'Publica un mensaje de sistema en el chat kind=quedada (actualizaciones de rondas y estado).';
