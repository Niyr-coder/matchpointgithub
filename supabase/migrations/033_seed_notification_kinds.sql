-- 032 · Seed notification_kinds catalog.
-- Inserts the kinds required by the in-app dispatchers (src/server/notifications/dispatch.ts).
-- Idempotent: uses on conflict do nothing.

insert into notification_kinds (kind, description, allowed_roles, default_channels, category) values
  -- Roles
  ('role_request_new',      'Nueva solicitud de rol recibida',     array['admin']::mp_role[],                        array['inapp']::mp_notification_channel[], 'roles'),
  ('role_request_approved', 'Tu solicitud de rol fue aprobada',    array['user','partner','owner','manager','coach','employee']::mp_role[], array['inapp','email']::mp_notification_channel[], 'roles'),
  ('role_request_rejected', 'Tu solicitud de rol fue rechazada',   array['user','partner','owner','manager','coach','employee']::mp_role[], array['inapp','email']::mp_notification_channel[], 'roles'),

  -- Club applications
  ('club_application_new',      'Nueva solicitud de club',         array['admin']::mp_role[],                        array['inapp']::mp_notification_channel[], 'clubs'),
  ('club_application_approved', 'Tu solicitud de club fue aprobada', array['user','owner']::mp_role[],               array['inapp','email']::mp_notification_channel[], 'clubs'),
  ('club_application_rejected', 'Tu solicitud de club fue rechazada', array['user']::mp_role[],                      array['inapp','email']::mp_notification_channel[], 'clubs'),
  ('club_application_status',   'Estado de tu solicitud de club',  array['user']::mp_role[],                         array['inapp']::mp_notification_channel[], 'clubs'),

  -- Reservations
  ('reservation_created',   'Reserva confirmada',                  array['user']::mp_role[],                         array['inapp']::mp_notification_channel[], 'reservations'),
  ('reservation_cancelled', 'Reserva cancelada',                   array['user']::mp_role[],                         array['inapp']::mp_notification_channel[], 'reservations'),

  -- Tickets / Support
  ('ticket_new',      'Nuevo ticket de soporte',                   array['admin']::mp_role[],                        array['inapp']::mp_notification_channel[], 'support'),
  ('ticket_assigned', 'Te asignaron un ticket de soporte',         array['admin']::mp_role[],                        array['inapp']::mp_notification_channel[], 'support'),

  -- Friends
  ('friend_request_new',  'Tienes una nueva solicitud de amistad', array['user']::mp_role[],                         array['inapp']::mp_notification_channel[], 'social')
on conflict (kind) do nothing;
