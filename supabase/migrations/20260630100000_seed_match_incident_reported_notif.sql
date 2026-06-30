-- Agrega el kind de notificación para incidentes de partido reportados por monitores.
-- Destinatario: partner (owner/admin del club organizador del torneo).

insert into notification_kinds (kind, description, allowed_roles, default_channels, category)
values (
  'match_incident_reported',
  'Incidente reportado durante un partido por el monitor de cancha',
  array['partner']::mp_role[],
  array['inapp']::mp_notification_channel[],
  'tournaments'
)
on conflict (kind) do update set
  description     = excluded.description,
  allowed_roles   = excluded.allowed_roles,
  default_channels = excluded.default_channels,
  category        = excluded.category;
