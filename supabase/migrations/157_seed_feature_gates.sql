-- 157 · Seed de flags de gating (todos encendidos = comportamiento actual sin
-- cambio, pero ahora manejables desde el panel y con efecto real al apagarlos).
-- El código los lee: sidebar oculta el item y la pantalla muestra "no disponible".
insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact) values
  ('coach_ai_enabled',        'Habilita Coach AI (análisis de video, sugerencias). Apagado = oculto del sidebar y pantalla no disponible.', true, 100, 'prod', 'med'),
  ('quedadas_enabled',        'Habilita Quedadas (juego social). Apagado = oculto del sidebar y pantalla no disponible.',                 true, 100, 'prod', 'med'),
  ('club_memberships_v2',     'Habilita Membresías de club. Apagado = pantalla no disponible (gating por club piloto vía excepción).',    true, 100, 'prod', 'med'),
  ('signups_open',            'Permite el registro de usuarios nuevos. Apagado = registros cerrados.',                                    true, 100, 'prod', 'high')
on conflict (key) do nothing;
