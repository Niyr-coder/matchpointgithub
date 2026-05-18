-- Notification kind para cancelación de torneo. La encolan setTournamentStatus
-- y cancelTournament cuando el torneo pasa a 'cancelled'. Idempotente.
insert into notification_kinds (kind, description, allowed_roles, default_channels, category) values
  ('tournament_cancelled',
   'Un torneo en el que estás inscrito fue cancelado',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'tournaments')
on conflict (kind) do nothing;
