-- 128 · Bundles cosméticos temáticos (inspirados, sin IP literal).
-- Suma 3 packs nuevos al catálogo `cosmetic_bundles`. Cada uno desbloquea su
-- tema homónimo en PROFILE_THEMES (src/lib/profile/customization-presets.ts) y
-- su bodyPattern en FALLBACK_BUNDLES (src/lib/profile/bundles.ts).
--
-- Nombres/arte propios para evitar riesgo de marcas registradas:
--   Brasa  → energía shōnen (rojos/negro, brasas)
--   Viñeta → cómic / pop-art (halftone, primarios, outline)
--   Vapor  → synthwave / vaporwave (grid retro, pink/cyan)
--
-- price_cents editable por admin (cb_admin_write). on conflict do nothing para
-- ser idempotente y no pisar precios ya ajustados.

insert into public.cosmetic_bundles (key, label, description, price_cents, sort_order) values
  ('pack_brasa',  'Pack Brasa',  'Energía shōnen — rojos sobre negro con brasas ardientes.', 500, 50),
  ('pack_vineta', 'Pack Viñeta', 'Estilo cómic — halftone, primarios y outline grueso.',     500, 60),
  ('pack_vapor',  'Pack Vapor',  'Synthwave — grid retro y neón pink/cyan.',                  500, 70)
on conflict (key) do nothing;
