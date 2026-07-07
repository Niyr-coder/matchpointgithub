-- 2026-07-23 · Flag killswitch del formato Modo Torneo en quedadas.
-- Encendido por defecto: si el motor de grupos/bracket falla en producción,
-- apagarlo oculta la card del wizard y bloquea crear quedadas 'torneo' sin
-- deploy. El código trata "flag ausente" como encendido (fail-open).
insert into public.feature_flags (key, description, enabled_default, rollout_pct, env, impact, label)
values (
  'quedada_format_torneo',
  'Formato Modo Torneo en quedadas (grupos → semifinales → final y bronce). Apagado = la opción desaparece del wizard y createQuedada rechaza el formato.',
  true,
  100,
  'prod',
  'med',
  'Quedadas · Modo Torneo'
)
on conflict (key) do nothing;
