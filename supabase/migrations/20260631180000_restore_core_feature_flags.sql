-- Restaura feature flags core que faltan en entornos con historial de migraciones
-- desincronizado (p. ej. remoto sin filas de quedadas_enabled, match_seeks_enabled,
-- shop_enabled, etc.). Idempotente: inserta los ausentes; no pisa enabled_default
-- de filas que ya existen.

insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact, label)
values
  (
    'match_seeks_enabled',
    'Tablón "Busco partido": publicar avisos y postularse para jugar partidos casuales. Apagado = oculto del sidebar y pantalla no disponible.',
    true,
    100,
    'prod',
    'med',
    'Busco partido'
  ),
  (
    'match_reliability_enabled',
    'No-show + score de fiabilidad: reportar inasistencias y mostrar badge de fiabilidad.',
    true,
    100,
    'prod',
    'med',
    'Fiabilidad de partidos'
  ),
  (
    'quedadas_enabled',
    'Habilita Quedadas (juego social). Apagado = oculto del sidebar y pantalla no disponible.',
    true,
    100,
    'prod',
    'med',
    'Quedadas'
  ),
  (
    'coach_ai_enabled',
    'Habilita Coach AI (análisis de video, sugerencias). Apagado = oculto del sidebar y pantalla no disponible.',
    true,
    100,
    'prod',
    'med',
    'Coach AI'
  ),
  (
    'club_memberships_v2',
    'Habilita Membresías de club. Apagado = pantalla no disponible (gating por club piloto vía excepción).',
    true,
    100,
    'prod',
    'med',
    'Membresías de club'
  ),
  (
    'club_giveaways_enabled',
    'Habilita sorteos v2: feed del club, mis sorteos, panel org. Apagado = kill switch global.',
    true,
    100,
    'prod',
    'med',
    'Sorteos del club'
  ),
  (
    'club_marketing_enabled',
    'Habilita Marketing del club (campañas, broadcasts a clientes). Apagado = oculto del sidebar y pantalla no disponible.',
    true,
    100,
    'prod',
    'med',
    'Marketing de club'
  ),
  (
    'shop_enabled',
    'Habilita Shop (jugador) y POS pro shop (empleado). Apagado = oculto del sidebar y mutaciones bloqueadas.',
    true,
    100,
    'prod',
    'med',
    'Tienda / Pro shop'
  ),
  (
    'maintenance_banner',
    'Estamos haciendo mantenimiento. Algunas funciones pueden fallar temporalmente.',
    false,
    0,
    'prod',
    'high',
    'Banner de mantenimiento'
  ),
  (
    'read_only_mode',
    'Kill switch global: bloquea mutaciones de jugadores y staff. Los admins pueden seguir operando desde el panel.',
    false,
    0,
    'prod',
    'high',
    'Modo solo lectura'
  ),
  (
    'profiles_rls_strict',
    'Activa RLS estricta en profiles: sin SELECT masivo para autenticados. Encender tras validar pantallas en staging.',
    false,
    0,
    'prod',
    'high',
    'Profiles RLS estricto'
  ),
  (
    'profile_customization',
    'Kill switch antiguo de personalización de perfil (legacy mig 113). Preferir paywall_enforce_profile_customization.',
    false,
    0,
    'prod',
    'low',
    'Personalización (legacy)'
  )
on conflict (key) do update set
  description = excluded.description,
  label = coalesce(excluded.label, feature_flags.label);

-- Paywalls (default off = no cambia comportamiento de cobro hasta que admin los encienda).
insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact)
values
  ('paywall_enforce_coach_ai', 'Gating real de Coach AI por plan premium. Apagado = todos pueden usarlo.', false, 0, 'prod', 'med'),
  ('paywall_enforce_player_history', 'Historial ilimitado en perfiles ajenos para premium (free = últimos 10).', false, 0, 'prod', 'low'),
  ('paywall_enforce_match_seek_cap', 'Cap de avisos "Busco partido" simultáneos por usuario free (premium = ilimitados).', false, 0, 'prod', 'low'),
  ('paywall_enforce_profile_customization', 'Customización avanzada (accent/banner/card) para premium o bundles.', false, 0, 'prod', 'low'),
  ('paywall_enforce_club_finanzas_advanced', 'Analytics avanzados de club-finanzas para clubes con plan Pro.', false, 0, 'prod', 'med'),
  ('paywall_enforce_club_marketing', 'Sección Marketing del club detrás de MP Club Pro.', false, 0, 'prod', 'med'),
  ('paywall_enforce_club_memberships', 'Motor de membresías v2 detrás de MP Club Pro.', false, 0, 'prod', 'med'),
  ('paywall_enforce_partner_tournaments_cap', 'Cap de torneos activos simultáneos para partners free.', false, 0, 'prod', 'med')
on conflict (key) do update set
  description = excluded.description;

-- platform_config de busco partido (por si también faltó mig 120).
insert into platform_config (key, value, description)
values
  ('match_seek_expiry_days', '7'::jsonb, 'Días que vive un aviso de "Busco partido" antes de expirar.'),
  ('match_seek_max_open_per_user', '5'::jsonb, 'Máximo de avisos "Busco partido" abiertos simultáneos por jugador.')
on conflict (key) do nothing;

-- Postura beta abierta: encender flags de producto (admin puede apagarlos después).
update feature_flags
set enabled_default = true, rollout_pct = 100
where key in (
  'quedadas_enabled',
  'match_seeks_enabled',
  'shop_enabled',
  'match_reliability_enabled',
  'coach_ai_enabled',
  'club_memberships_v2',
  'club_giveaways_enabled',
  'club_marketing_enabled'
);
