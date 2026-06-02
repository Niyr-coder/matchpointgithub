-- Tras eliminar un amigo queda friend_requests en accepted/rejected; el remitente
-- debe poder reabrir su solicitud a pending sin depender de service role.

create policy fr_sender_reopen on public.friend_requests
  for update
  to authenticated
  using (
    from_user_id = auth.uid()
    and status in ('accepted', 'rejected', 'cancelled')
  )
  with check (
    from_user_id = auth.uid()
    and status = 'pending'
  );
