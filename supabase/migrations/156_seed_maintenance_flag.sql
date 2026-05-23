-- 156 · Seed del flag maintenance_banner (apagado). El layout del dashboard lo
-- lee y muestra un banner global cuando está on; el mensaje es la `description`.
-- Cableado en src/app/dashboard/[role]/layout.tsx + DashboardChrome.
insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact)
values (
  'maintenance_banner',
  'Estamos haciendo mantenimiento. Algunas funciones pueden fallar temporalmente.',
  false, 0, 'prod', 'high'
)
on conflict (key) do nothing;
