-- P3-B · Fix recursión RLS en conversation_members.
-- cm_member_select y cm_admin_invite consultaban conversation_members desde
-- policies de la misma tabla. Eso disparaba 42P17 al leer unread del chat y al
-- validar el DM oficial MATCHPOINT. Usamos helpers SECURITY DEFINER, mismo
-- patrón que quedadas/reservations, para evaluar membresía sin reentrar en RLS.

create or replace function public.mp_is_conversation_member(
  p_conversation uuid,
  p_user uuid,
  p_active_only boolean default false
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.user_id = p_user
      and (not p_active_only or cm.left_at is null)
  );
$$;

create or replace function public.mp_is_conversation_admin(
  p_conversation uuid,
  p_user uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.user_id = p_user
      and cm.role = 'admin'
      and cm.left_at is null
  );
$$;

create or replace function public.mp_conversation_has_other_system_member(
  p_conversation uuid,
  p_sender uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.conversation_id = p_conversation
      and cm.user_id <> p_sender
      and cm.left_at is null
      and p.is_system = true
  );
$$;

revoke all on function public.mp_is_conversation_member(uuid, uuid, boolean) from public;
revoke all on function public.mp_is_conversation_admin(uuid, uuid) from public;
revoke all on function public.mp_conversation_has_other_system_member(uuid, uuid) from public;

grant execute on function public.mp_is_conversation_member(uuid, uuid, boolean) to authenticated, anon, service_role;
grant execute on function public.mp_is_conversation_admin(uuid, uuid) to authenticated, anon, service_role;
grant execute on function public.mp_conversation_has_other_system_member(uuid, uuid) to authenticated, anon, service_role;

drop policy if exists conv_member_select on public.conversations;
create policy conv_member_select on public.conversations
  for select using (public.mp_is_conversation_member(id, auth.uid(), true));

drop policy if exists conv_admin_update on public.conversations;
create policy conv_admin_update on public.conversations
  for update using (public.mp_is_conversation_admin(id, auth.uid()));

drop policy if exists cm_self_select on public.conversation_members;
create policy cm_self_select on public.conversation_members
  for select using (user_id = auth.uid());

drop policy if exists cm_member_select on public.conversation_members;
create policy cm_member_select on public.conversation_members
  for select using (
    public.mp_is_conversation_member(conversation_members.conversation_id, auth.uid(), false)
  );

drop policy if exists cm_admin_invite on public.conversation_members;
create policy cm_admin_invite on public.conversation_members
  for insert with check (
    public.mp_is_conversation_admin(conversation_members.conversation_id, auth.uid())
  );

drop policy if exists messages_member_select on public.messages;
create policy messages_member_select on public.messages
  for select using (
    public.mp_is_conversation_member(messages.conversation_id, auth.uid(), true)
  );

drop policy if exists messages_member_insert on public.messages;
create policy messages_member_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and public.mp_is_conversation_member(messages.conversation_id, auth.uid(), true)
  );

drop policy if exists messages_no_send_to_system on public.messages;
create policy messages_no_send_to_system on public.messages
  as restrictive
  for insert
  with check (
    not public.mp_conversation_has_other_system_member(messages.conversation_id, messages.sender_id)
  );

drop policy if exists ma_visible on public.message_attachments;
create policy ma_visible on public.message_attachments
  for select using (
    exists (
      select 1
      from public.messages m
      where m.id = message_attachments.message_id
        and public.mp_is_conversation_member(m.conversation_id, auth.uid(), true)
    )
  );

comment on function public.mp_is_conversation_member(uuid, uuid, boolean) is
  'Evalúa membresía de una conversación sin disparar RLS de conversation_members. Evita 42P17 en policies de mensajería.';

comment on function public.mp_is_conversation_admin(uuid, uuid) is
  'Evalúa si un usuario es admin activo de una conversación sin reentrar en RLS de conversation_members.';

comment on function public.mp_conversation_has_other_system_member(uuid, uuid) is
  'Detecta DMs con otro miembro system para bloquear respuestas al canal oficial MATCHPOINT sin recursión RLS.';
