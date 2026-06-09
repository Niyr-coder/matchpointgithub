-- Kill switch sorteos v2 (feed del club, mis sorteos, panel org).
-- Cableado: src/lib/flags/registry.ts · sidebar · ClubProfileView · giveaways.ts
insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact, label)
values (
  'club_giveaways_enabled',
  'Habilita sorteos v2: feed del club, mis sorteos, panel org y detalle de participación. Apagado = oculto del sidebar y mutaciones bloqueadas.',
  true,
  100,
  'prod',
  'med',
  'Sorteos del club'
)
on conflict (key) do nothing;
