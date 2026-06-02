-- Permite crear friendship al aceptar una solicitud (antes solo
-- SECURITY DEFINER en perfiles is_system podía insertar vía trigger).

create policy friendships_insert_pending_accept on public.friendships
  for insert
  to authenticated
  with check (
    auth.uid() in (user_a, user_b)
    and user_a < user_b
    and exists (
      select 1
      from public.friend_requests fr
      where fr.to_user_id = auth.uid()
        and fr.from_user_id in (user_a, user_b)
        and fr.to_user_id in (user_a, user_b)
        and fr.status in ('pending', 'accepted')
    )
  );

insert into notification_kinds (kind, description, allowed_roles, default_channels, category)
values
  (
    'friend_request_accepted',
    'Tu solicitud de amistad fue aceptada',
    array['user']::mp_role[],
    array['inapp']::mp_notification_channel[],
    'social'
  )
on conflict (kind) do nothing;
