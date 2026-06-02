-- 179 · Roles de club: soporte y finanzas con permisos más acotados.
-- Mantiene owner/manager/admin con operación completa, permite a employee ver
-- tickets del club y responder solo tickets propios o asignados.

drop policy if exists tk_club_staff on public.tickets;
drop policy if exists tk_employee_club_select on public.tickets;
drop policy if exists tk_club_staff_select on public.tickets;
drop policy if exists tk_club_staff_update on public.tickets;
drop policy if exists tk_club_staff_delete on public.tickets;
drop policy if exists tk_assignee_update on public.tickets;

create policy tk_employee_club_select on public.tickets
  for select using (club_id is not null and public.mp_is_employee_of(club_id));

create policy tk_club_staff_select on public.tickets
  for select using (club_id is not null and public.mp_club_staff(club_id));

create policy tk_club_staff_update on public.tickets
  for update using (club_id is not null and public.mp_club_staff(club_id))
  with check (club_id is not null and public.mp_club_staff(club_id));

create policy tk_assignee_update on public.tickets
  for update using (assignee_id = auth.uid())
  with check (assignee_id = auth.uid());

create policy tk_club_staff_delete on public.tickets
  for delete using (club_id is not null and public.mp_club_staff(club_id));

drop policy if exists tm_post on public.ticket_messages;
drop policy if exists tm_visible on public.ticket_messages;

create policy tm_visible on public.ticket_messages
  for select using (
    exists(
      select 1
      from public.tickets t
      where t.id = ticket_id
        and (
          t.opener_id = auth.uid()
          or t.assignee_id = auth.uid()
          or (t.club_id is not null and (public.mp_club_staff(t.club_id) or public.mp_is_employee_of(t.club_id)))
          or public.mp_is_admin()
        )
    )
    and (
      internal = false
      or auth.uid() <> (select opener_id from public.tickets where id = ticket_id)
    )
  );

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
        )
    )
  );

drop policy if exists tx_staff_all on public.transactions;
drop policy if exists tx_club_staff_select on public.transactions;
drop policy if exists tx_club_staff_insert on public.transactions;
drop policy if exists tx_club_staff_update on public.transactions;
drop policy if exists tx_employee_select on public.transactions;
drop policy if exists tx_employee_insert on public.transactions;

create policy tx_club_staff_select on public.transactions
  for select using (club_id is not null and public.mp_club_staff(club_id));

create policy tx_club_staff_insert on public.transactions
  for insert with check (club_id is not null and public.mp_club_staff(club_id));

create policy tx_club_staff_update on public.transactions
  for update using (club_id is not null and public.mp_club_staff(club_id))
  with check (club_id is not null and public.mp_club_staff(club_id));

create policy tx_employee_select on public.transactions
  for select using (club_id is not null and public.mp_is_employee_of(club_id));

create policy tx_employee_insert on public.transactions
  for insert with check (
    club_id is not null
    and public.mp_is_employee_of(club_id)
    and created_by = auth.uid()
    and kind in ('reservation', 'proshop_sale', 'custom')
  );

drop policy if exists refunds_staff on public.refunds;
drop policy if exists refunds_club_staff on public.refunds;

create policy refunds_club_staff on public.refunds
  for all using (
    exists(
      select 1
      from public.transactions t
      where t.id = transaction_id
        and public.mp_club_staff(t.club_id)
    )
  )
  with check (
    exists(
      select 1
      from public.transactions t
      where t.id = transaction_id
        and public.mp_club_staff(t.club_id)
    )
  );
