-- 20260719000000 · Flag para el bloqueo duro de MPR por categoría.
--
-- Elegibilidad de inscripción por categoría (Stage 5 del plan multi-categoría):
-- - Edad: bloqueo duro server-side SIEMPRE activo, solo para jugadores con
--   birthdate registrado (sin dato no se bloquea). Sin flag.
-- - MPR: TODO rating nace en 2500 (= 2.5 mostrado), así que un bloqueo duro
--   dejaría fuera a jugadores reales de categorías 3.5+. Mientras los ratings
--   maduran, el modal de categoría muestra un AVISO informativo y este flag
--   (default OFF) guarda el bloqueo duro en registerToTournament para
--   activarlo sin redeploy cuando el pool de ratings sea representativo.
-- - Género: sin enforcement (profiles no registra género hoy).

insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact)
values (
  'category_mpr_enforcement',
  'Bloqueo duro de inscripción por rango MPR de la categoría (registerToTournament). OFF = solo aviso informativo en el modal; ON = rechaza con TOURNAMENTS.CATEGORY_MPR_INELIGIBLE. Activar cuando los ratings dejen de estar todos en el 2.5 inicial.',
  false,
  100,
  'prod',
  'med'
)
on conflict (key) do nothing;
