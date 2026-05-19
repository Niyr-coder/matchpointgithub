-- 113 · Customización de perfil gateada por MatchPoint+.
-- 3 columnas nullable en profiles: accent_color, banner_preset, card_style.
-- Los valores son keys del catálogo en src/lib/profile/customization-presets.ts;
-- la validación de qué keys son válidas vive en server action, no en DB,
-- para evitar redeploy de migration cada vez que sumamos un preset nuevo.
-- Feature flag profile_customization (default on) como killswitch.

alter table public.profiles
  add column if not exists accent_color text,
  add column if not exists banner_preset text,
  add column if not exists card_style text;

insert into public.feature_flags (key, description, enabled_default, rollout_pct)
values (
  'profile_customization',
  'Permite a usuarios MP+ elegir accent color, banner y card style del perfil.',
  true,
  100
)
on conflict (key) do nothing;
