-- Último mensaje por conversación (inbox) en una sola query — evita escanear cientos de filas en el server.

create or replace function public.fn_last_messages_by_conversations(p_conv_ids uuid[])
returns table (
  conversation_id uuid,
  message_id uuid,
  body text,
  sender_id uuid,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (m.conversation_id)
    m.conversation_id,
    m.id,
    m.body,
    m.sender_id,
    m.created_at
  from public.messages m
  where m.conversation_id = any (p_conv_ids)
    and m.deleted_at is null
  order by m.conversation_id, m.created_at desc;
$$;

grant execute on function public.fn_last_messages_by_conversations(uuid[]) to authenticated;

comment on function public.fn_last_messages_by_conversations(uuid[]) is
  'Preview del último mensaje por conversación para el inbox de Mensajes.';
