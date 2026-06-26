-- Seed del flag paywall_enforce_quedadas.
--
-- Controla si crear una quedada requiere plan premium. Semántica estándar:
--   false (default) → todos pueden crear quedadas (comportamiento actual).
--   true            → solo usuarios MATCHPOINT+ pueden crear quedadas;
--                     usuarios free reciben PLAN.UPGRADE_REQUIRED (402).
--
-- El gate vive en createQuedada (src/server/actions/quedadas.ts) vía
-- requirePlanWithFlag. Para activarlo, flipear el flag desde
-- /dashboard/admin/admin-flags sin redeploy.

insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact)
values (
  'paywall_enforce_quedadas',
  'Crear quedadas requiere plan MATCHPOINT+. Apagado = todos pueden crear (estado inicial).',
  false,
  0,
  'prod',
  'med'
)
on conflict (key) do nothing;
