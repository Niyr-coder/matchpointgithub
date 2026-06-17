-- Beta cerrada asistida: defaults conservadores en prod.
-- Clubes piloto reciben excepciones vía feature_flag_assignments
-- (scripts/seed-beta-cohort.ts).

-- Sorteos: apagado global; encender por club piloto.
update feature_flags
set
  enabled_default = false,
  description = 'Habilita sorteos v2: feed del club, mis sorteos, panel org. Apagado globalmente; clubes piloto vía excepción en feature_flag_assignments.'
where key = 'club_giveaways_enabled';

-- Marketing: flag + default off hasta cron dispatch-broadcasts operativo.
insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact, label)
values (
  'club_marketing_enabled',
  'Habilita Marketing del club (campañas, broadcasts a clientes). Apagado = oculto del sidebar. En beta usar excepción por club piloto.',
  false,
  0,
  'prod',
  'med',
  'Marketing de club'
)
on conflict (key) do update set
  enabled_default = excluded.enabled_default,
  description = excluded.description;

-- Features avanzadas: off por defecto en beta (piloto vía assignment).
update feature_flags
set enabled_default = false
where key in ('club_memberships_v2', 'coach_ai_enabled');

-- Registro abierto para onboarding asistido de fundadores.
update feature_flags
set enabled_default = true
where key = 'signups_open';
