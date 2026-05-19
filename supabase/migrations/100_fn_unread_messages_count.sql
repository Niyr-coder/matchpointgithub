-- 100 · fn_unread_messages_count
-- Reemplaza el N+1 del chat: antes [role]/layout.tsx y MensajesScreen.tsx
-- hacían 1 count() por conversación del user (Promise.all sobre N convs).
-- Esta función lo resuelve con 1 sola query.
--
-- Security INVOKER: las RLS de conversation_members + messages ya filtran
-- por auth.uid(); el caller solo ve sus propias convs y mensajes.
-- Devuelve filas (conversation_id, unread_count). El layout del rol user
-- suma para el badge total; MensajesScreen mapea por conversación.

create or replace function fn_unread_messages_count()
returns table (conversation_id uuid, unread_count int)
language sql
stable
security invoker
set search_path = public
as $$
  with my_convs as (
    select cm.conversation_id, cm.last_read_message_id
    from conversation_members cm
    where cm.user_id = auth.uid()
      and cm.left_at is null
  ),
  last_read_ts as (
    select mc.conversation_id, m.created_at as last_read_at
    from my_convs mc
    left join messages m on m.id = mc.last_read_message_id
  )
  select
    lr.conversation_id,
    count(m.id)::int as unread_count
  from last_read_ts lr
  left join messages m
    on m.conversation_id = lr.conversation_id
    and m.deleted_at is null
    and m.sender_id <> auth.uid()
    and (lr.last_read_at is null or m.created_at > lr.last_read_at)
  group by lr.conversation_id;
$$;

grant execute on function fn_unread_messages_count() to authenticated;

comment on function fn_unread_messages_count() is
  'Devuelve unread count por conversación para auth.uid(). Reemplaza el N+1 que vivía en MensajesScreen y el badge chat del layout del rol user.';
