insert into notification_kinds (kind, description, allowed_roles, default_channels, category)
values (
  'reservation_no_show',
  'Reserva marcada como no-show en recepción',
  array['user']::mp_role[],
  array['inapp']::mp_notification_channel[],
  'reservations'
)
on conflict (kind) do nothing;
