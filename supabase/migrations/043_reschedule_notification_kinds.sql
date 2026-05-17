-- 043 · Notification kinds para reprogramación de eventos y torneos.
-- Las server actions admin (updateEventAdmin, updateTournamentAdmin) encolan
-- jobs en notification_jobs con estos kinds cuando cambian starts_at/ends_at.
-- Idempotente.
--
-- Audit logging: las server actions reutilizan fn_admin_audit_log() definido
-- en 042_admin_audit_log_fn.sql, no se crea otro helper aquí.

insert into notification_kinds (kind, description, allowed_roles, default_channels, category) values
  ('event_rescheduled',
   'Un evento al que te inscribiste cambió de fecha u horario',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'events'),
  ('tournament_rescheduled',
   'Un torneo en el que estás inscrito cambió de fecha u horario',
   array['user']::mp_role[],
   array['inapp']::mp_notification_channel[],
   'tournaments')
on conflict (kind) do nothing;
