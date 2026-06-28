-- fn_enqueue_notification lanza 'unknown notification kind' si el kind no está
-- en notification_kinds. Los siguientes kinds se usan en server actions pero
-- nunca fueron sembrados, causando excepciones silenciosas al disparar notifs.

insert into public.notification_kinds (kind, description, allowed_roles, default_channels, category) values
  -- Club comms
  ('club_announcement_new',
   'Nuevo anuncio publicado en tu club',
   array['user','owner','manager','partner','coach','employee']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'clubs'),

  ('club_membership_chat_welcome',
   'Ya tienes acceso al chat comunitario del club',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'clubs'),

  -- Social / amigos
  ('friend_request_accepted',
   'Aceptaron tu solicitud de amistad',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'social'),

  -- Giveaways
  ('giveaway_started',
   'Un sorteo arrancó en tu club',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'clubs'),

  ('giveaway_won',
   '¡Ganaste un sorteo!',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'clubs'),

  -- Partidos / matches
  ('match_challenge_accepted',
   'Aceptaron tu desafío de partido',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'matches'),

  ('match_result_reported',
   'Se reportó el resultado de tu partido',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'matches'),

  ('match_walkover_declared',
   'Se declaró walkover en tu partido de torneo',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'tournaments'),

  -- Reservas
  ('reservation_checked_in',
   'Check-in registrado en tu reserva',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'reservations'),

  ('reservation_no_show',
   'Inasistencia marcada en tu reserva',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'reservations'),

  -- Soporte
  ('ticket_status_changed',
   'El estado de tu ticket de soporte cambió',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'support')

on conflict (kind) do update set
  description    = excluded.description,
  allowed_roles  = excluded.allowed_roles,
  default_channels = excluded.default_channels,
  category       = excluded.category;
