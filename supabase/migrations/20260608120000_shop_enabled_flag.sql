-- Kill switch tienda / pro shop (jugador + POS empleado).
-- Cableado: src/lib/flags/registry.ts · sidebar · SECTION_FLAGS · proshop.ts
insert into feature_flags (key, description, enabled_default, rollout_pct, env, impact, label)
values (
  'shop_enabled',
  'Habilita Shop (jugador) y POS pro shop (empleado). Apagado = oculto del sidebar y mutaciones bloqueadas.',
  false,
  100,
  'prod',
  'med',
  'Tienda / Pro shop'
)
on conflict (key) do nothing;
