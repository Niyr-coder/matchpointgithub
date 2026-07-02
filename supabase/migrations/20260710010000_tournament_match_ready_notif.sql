-- 20260710010000 · Notif "te toca jugar" (tournament_match_ready).
--
-- Se dispara cuando el partido de un jugador queda con ambos lados definidos:
-- generación de llave (ronda 1), avance de ganador que completa el siguiente
-- partido, partido de bronce completado, y sorteo de grupos (una notif por
-- jugador, no por partido).
--
-- El render usa el fallback genérico del dispatcher: title/body van en el
-- payload desde el server action (mismo patrón que match_incident_reported,
-- mig 20260630100000). El href lo deriva NotificationsPanel por kind.
--
-- Killswitch: flag tournament_match_ready_notifs (default ON — es mejora de
-- experiencia, no rollout riesgoso; apagarla detiene el enqueue en el acto).

insert into notification_kinds (kind, description, allowed_roles, default_channels, category)
values (
  'tournament_match_ready',
  'Tu partido de torneo quedó listo (rival definido) — te toca jugar',
  array['user']::mp_role[],
  array['inapp']::mp_notification_channel[],
  'tournaments'
)
on conflict (kind) do update set
  description      = excluded.description,
  allowed_roles    = excluded.allowed_roles,
  default_channels = excluded.default_channels,
  category         = excluded.category;

insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact)
values (
  'tournament_match_ready_notifs',
  'Notifica "te toca jugar" a los jugadores cuando su partido de torneo queda listo (llave generada, rival definido por avance, grupos sorteados). Apagado = no se encola ninguna notif de este kind.',
  true,
  100,
  'prod',
  'low'
)
on conflict (key) do nothing;
