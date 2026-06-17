-- Beta abierta: features disponibles para todos los usuarios (no solo pilotos).
-- Reemplaza la postura conservadora de 20260608140000_beta_launch_flag_defaults.
-- Admin puede apagar cualquiera desde Admin · Feature flags (enabled_default).

-- Sorteos: encendido global para la beta abierta.
update feature_flags
set
  enabled_default = true,
  description = 'Habilita sorteos v2: feed del club, mis sorteos, panel org. Beta abierta: encendido para todos; admin puede apagar.'
where key = 'club_giveaways_enabled';

-- Marketing de club: encendido global (cron dispatch-broadcasts ya operativo).
insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact, label)
values (
  'club_marketing_enabled',
  'Habilita Marketing del club (campañas, broadcasts a clientes). Beta abierta: encendido para todos; admin puede apagar.',
  true,
  100,
  'prod',
  'med',
  'Marketing de club'
)
on conflict (key) do update set
  enabled_default = excluded.enabled_default,
  description = excluded.description;

-- Membresías v2 y coach-AI: encendidos para todos en beta abierta.
update feature_flags
set enabled_default = true
where key in ('club_memberships_v2', 'coach_ai_enabled');

-- Registro abierto (se mantiene).
update feature_flags
set enabled_default = true
where key = 'signups_open';
