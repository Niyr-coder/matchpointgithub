-- La policy reg_self_withdraw solo tenía USING; sin WITH CHECK explícito,
-- el row post-update también tenía que satisfacer USING (status IN
-- pending/accepted), lo que bloqueaba la transición a 'withdrawn'.
-- WITH CHECK ahora acepta esa transición además de mantener el estado.
drop policy if exists reg_self_withdraw on public.registrations;
create policy reg_self_withdraw on public.registrations
  for update
  using (registered_by = auth.uid() and status in ('pending', 'accepted'))
  with check (registered_by = auth.uid() and status in ('pending', 'accepted', 'withdrawn'));
