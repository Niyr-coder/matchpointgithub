-- Registro con MATCHPOINT+ automático (toggle admin, apagado por defecto).
insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact, label)
values (
  'signup_auto_mp_plus',
  'Activa MATCHPOINT+ automáticamente a cada usuario nuevo al registrarse (email u OAuth). Apagado = registro sin premium.',
  false,
  100,
  'prod',
  'high',
  'MP+ automático al registrarse'
)
on conflict (key) do update set
  description = excluded.description,
  label = excluded.label;
