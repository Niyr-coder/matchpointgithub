-- Admin de plataforma puede responder tickets aunque no esté asignado.
drop policy if exists tm_post on public.ticket_messages;

create policy tm_post on public.ticket_messages
  for insert with check (
    author_id = auth.uid()
    and exists(
      select 1
      from public.tickets t
      where t.id = ticket_id
        and (
          t.opener_id = auth.uid()
          or t.assignee_id = auth.uid()
          or (t.club_id is not null and public.mp_club_staff(t.club_id))
          or public.mp_is_admin()
        )
    )
  );

-- WITH CHECK explícito para updates de admin en tickets.
drop policy if exists tk_admin_all on public.tickets;

create policy tk_admin_all on public.tickets
  for all
  using (public.mp_is_admin())
  with check (public.mp_is_admin());
