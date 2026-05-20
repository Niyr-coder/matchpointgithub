-- 120 · Feature flag + platform_config para "Busco partido".
-- Ver docs/architecture/23 (feature flags) y docs/guides/03-platform-config.md.
--
-- El feature arranca OCULTO (enabled_default=false) hasta validar densidad de
-- jugadores por ciudad. Se prende por rol/ciudad vía feature_flag_assignments
-- o global subiendo enabled_default.

insert into feature_flags (key, description, enabled_default, rollout_pct)
values (
  'match_seeks_enabled',
  'Tablón "Busco partido": publicar avisos y postularse para jugar partidos casuales.',
  false,
  0
)
on conflict (key) do nothing;

-- Parámetros de negocio (no hardcodear en código).
insert into platform_config (key, value, description) values
  ('match_seek_expiry_days',
   '7'::jsonb,
   'Días que vive un aviso de "Busco partido" antes de expirar.'),
  ('match_seek_max_open_per_user',
   '5'::jsonb,
   'Máximo de avisos "Busco partido" abiertos simultáneos por jugador.')
on conflict (key) do nothing;
