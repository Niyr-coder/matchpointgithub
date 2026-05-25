-- 172 · Kill-switches por feature para los paywalls de MATCHPOINT+ y MP Club Pro.
--
-- Cada flag `paywall_enforce_<feature>` controla si el gate `requirePlan` se
-- aplica o se salta en su caller. Semántica:
--
--   enabled_default = false  → paywall NO se aplica (comportamiento actual,
--                              gratuito para todos). Es la posición segura.
--   enabled_default = true   → paywall efectivo: usuarios sin plan suficiente
--                              reciben PLAN.UPGRADE_REQUIRED.
--
-- Sembrar todos en false permite cablear `requirePlanWithFlag` en server actions
-- sin cambiar comportamiento de producción. Cuando el equipo decide activar un
-- paywall, flipea el flag en /dashboard/admin/admin-flags y el gate empieza a
-- aplicarse. Para rollout gradual: usar `feature_flag_assignments` por rol
-- (`role='user'`) o por usuario (`scope='user'`) — el resolver
-- `fn_my_effective_flags` ya soporta jerarquía user > club > role > default.
--
-- Para apagar de emergencia: flipea de vuelta a false → el gate se desactiva
-- en el próximo request, sin redeploy.
--
-- Helper en código: src/lib/auth/plan.ts → requirePlanWithFlag().
-- Registro: src/lib/flags/registry.ts.

insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact) values
  -- Jugador (MP+ player)
  ('paywall_enforce_coach_ai',               'Gating real de Coach AI por plan premium. Apagado = todos pueden usarlo.',                                                     false, 0, 'prod', 'med'),
  ('paywall_enforce_player_history',         'Historial ilimitado en perfiles ajenos para premium (free = últimos 10).',                                                     false, 0, 'prod', 'low'),
  ('paywall_enforce_match_seek_cap',         'Cap de avisos "Busco partido" simultáneos por usuario free (premium = ilimitados).',                                           false, 0, 'prod', 'low'),
  ('paywall_enforce_profile_customization',  'Customización avanzada (accent/banner/card) para premium o bundles. Free queda con presets default.',                         false, 0, 'prod', 'low'),
  -- Club / Owner (MP Club Pro)
  ('paywall_enforce_club_finanzas_advanced', 'Analytics avanzados de club-finanzas para clubes con plan Pro (heatmap, cohorts, export histórico). Free ve KPIs 30 días.',  false, 0, 'prod', 'med'),
  ('paywall_enforce_club_marketing',         'Sección Marketing del club detrás de MP Club Pro. Free = no disponible.',                                                     false, 0, 'prod', 'med'),
  ('paywall_enforce_club_memberships',       'Motor de membresías v2 detrás de MP Club Pro. Free = no disponible.',                                                         false, 0, 'prod', 'med'),
  -- Partner / Organizador
  ('paywall_enforce_partner_tournaments_cap','Cap de torneos activos simultáneos para partners free (premium = ilimitados).',                                               false, 0, 'prod', 'med')
on conflict (key) do nothing;
