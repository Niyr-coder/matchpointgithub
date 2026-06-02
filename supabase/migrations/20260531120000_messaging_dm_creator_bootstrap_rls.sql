-- DM bootstrap: al crear un chat directo el autor aún no es miembro.
-- Sin estas policies, insert + .select() en conversations falla (conv_member_select)
-- y conversation_members no permite el primer insert (cm_admin_invite exige admin previo).

drop policy if exists conv_creator_select on public.conversations;
create policy conv_creator_select on public.conversations
  for select using (created_by = auth.uid());

drop policy if exists cm_creator_bootstrap on public.conversation_members;
create policy cm_creator_bootstrap on public.conversation_members
  for insert with check (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_members.conversation_id
        and c.created_by = auth.uid()
    )
  );

comment on policy conv_creator_select on public.conversations is
  'Permite al creador leer la fila recién insertada antes de sumar conversation_members (startConversation).';

comment on policy cm_creator_bootstrap on public.conversation_members is
  'El creador del hilo puede sumar miembros iniciales (él + destinatario en DM). Complementa cm_admin_invite.';
