-- 20260626210001 · Feature flag: sistema de monitores de cancha.
--
-- default false → la sección "AÑADIR MONITORES" del partner y la ruta
-- /t/[slug]/monitor quedan inactivas hasta que admin lo encienda.

insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact)
values (
  'tournament_monitors_enabled',
  'Habilita el sistema de monitores de cancha en torneos. Encendido = el partner puede asignar monitores y los monitores acceden a /t/[slug]/monitor para llevar el marcador. Apagado = feature invisible (estado inicial).',
  false,
  0,
  'prod',
  'med'
)
on conflict (key) do nothing;
