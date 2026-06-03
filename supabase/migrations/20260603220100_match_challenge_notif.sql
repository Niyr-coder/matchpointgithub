-- Kinds para retos con aceptación explícita antes del chat grupal.

insert into notification_kinds (kind, description, allowed_roles, default_channels, category) values
  ('match_challenge_received', 'Reto de duelo pendiente de aceptación',
   array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'matches'),
  ('match_challenge_accepted', 'Un jugador aceptó tu reto',
   array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'matches')
on conflict (kind) do update set
  description = excluded.description,
  allowed_roles = excluded.allowed_roles,
  default_channels = excluded.default_channels,
  category = excluded.category;
