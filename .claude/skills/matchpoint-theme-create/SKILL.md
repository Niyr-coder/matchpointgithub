---
name: matchpoint-theme-create
description: Crea o modifica temas de personalización de perfil (PROFILE_THEMES) y bundles cosméticos en MatchPoint v2 respetando el estándar — estructura autocontenida, rareza + escalera de intensidad del card, regla de NUNCA usar boxShadow, contraste de CTAs, ownership MP+, y temáticas inspiradas sin IP literal. Úsala cuando el usuario quiera agregar un tema nuevo, un pack/bundle nuevo, cambiar colores/combos de un tema, ajustar rarezas, o tocar el catálogo de personalización. Cubre las dos capas: contenido (catálogo en código + seed de bundle en DB) y render cross-superficie (perfil/ranking/roster/amigos). Complementa matchpoint-feature-plan (planning general) y emil-design-eng (animación) — esta es específica del dominio de temas.
---

# MatchPoint Theme Create

Skill para autorar temas de personalización y bundles cosméticos sin romper el
estándar visual ni el contrato de ownership/render. El sistema de temas tiene
reglas duras que NO son obvias leyendo el código — esta skill las concentra.

## Fuente de verdad

`src/lib/profile/customization-presets.ts` → **`PROFILE_THEMES`** es la única
fuente de verdad. Cada tema es un objeto **autocontenido** con valores inline.
NO referencia catálogos sueltos. Los catálogos legacy (`ACCENT_COLORS`/
`BANNER_PRESETS`/`CARD_STYLES`) y sus Sets se **derivan** de `PROFILE_THEMES`,
así el render no cambia al agregar un tema.

```ts
type ProfileTheme = {
  key: string;          // único; se persiste en las 3 columnas de profiles
  label: string;
  bundleKey: string;    // 'free' | 'mp_plus' | 'pack_*'
  accentHex: string | null;   // null = usa var(--primary)
  bannerCss: string | null;   // gradiente del banner
  cardCss: ThemeCardCss | null; // { background, border?, backdropFilter?, color? }
};
```

## Reglas duras (cosas que rompen seguido)

1. **NUNCA `boxShadow` en `cardCss`.** Ni glow (`0 0 Npx`) ni sombras de color.
   La diferenciación es por `background` + `border` (+ `backdropFilter`). La
   sombra queda en el default de `.card`. Decisión de producto firme.

2. **Armonía de color.** El `accentHex` debe vivir dentro de la paleta del
   `bannerCss`. El `cardCss` es coherente con el mismo tono. Combos disonantes
   (ej. accent verde sobre banner azul, card holográfica pink/cyan sobre oro)
   se ven mal — evitarlos.

3. **Contraste legible.** El número de la stat card y el texto de los CTAs
   teñidos usan `readableTextOn(hex)` (umbral WCAG ~0.179): accents claros →
   texto negro, oscuros → blanco. Si autoras un accent muy claro/medio,
   verificá que el texto siga legible.

4. **Ownership = MP+.** La personalización es exclusiva de MatchPoint+:
   - `free` (Clásico/default): todos.
   - `mp_plus`: requiere MP+ activo.
   - `pack_*`: requiere MP+ activo **Y** grant en `profile_cosmetic_grants`.
   La regla vive en `canUsePreset` (`src/lib/profile/bundles.ts`). No la
   dupliques. Ver memoria [[project_personalization_mp_plus_only]].

5. **Sin IP literal.** Temáticas anime/comic/etc se hacen **inspiradas con
   nombre y arte propios** (Brasa, Viñeta, Vapor), NUNCA marcas registradas.
   Riesgo legal en producto pago. Ver [[project_cosmetic_no_literal_ip]].

## Rareza y escalera de intensidad del card

Rareza es metadata visual (`THEME_RARITY` + `RARITY_META`), no afecta gating.
El picker se ordena por rareza (`PROFILE_THEMES_BY_RARITY`). La **intensidad del
card-style debe escalar con la rareza** para una progresión coherente:

| Rareza | Card-style |
|---|---|
| `comun` | default (sin tratamiento) |
| `raro` | glass con tinte claro del accent + borde del accent |
| `epico` | tinte más saturado del accent + borde del accent |
| `mitico` | card oscura/saturada + borde de color |
| `legendario` | card rica + borde marcado |
| `especial` | gradiente oscuro + borde de color |
| `unico` | máximo (outline grueso / gradiente fuerte) |

Color de cada rareza (badge) en `RARITY_META`. Al asignar rareza, mantené la
card del tema acorde a su nivel.

## Cómo agregar un TEMA (sin bundle nuevo)

Para un tema `mp_plus` (incluido en premium):

1. Agregá una entry a `PROFILE_THEMES` con valores inline (key/label/
   `bundleKey:"mp_plus"`/accentHex/bannerCss/cardCss). Card sin boxShadow.
2. Asigná su rareza en `THEME_RARITY` y ajustá el card a esa intensidad.
3. `tsc --noEmit` + `eslint`. Listo — catálogos derivados y Sets se recalculan.

## Cómo agregar un PACK/BUNDLE nuevo

Un pack pago necesita **4 puntos sincronizados** (1 tema por bundle, sin
huérfanos):

1. **`Tier`** (customization-presets.ts): agregá la key `'pack_<x>'` al union.
2. **`PROFILE_THEMES`**: entry con `bundleKey:"pack_<x>"`, valores inline.
3. **`FALLBACK_BUNDLES`** (`src/lib/profile/bundles.ts`): entry con `key`,
   `label`, `description`, `priceCents`, `accent`, y `bodyPattern` (overlay del
   banner — SVG data-URI tile y/o gradientes; se aplica con `mix-blend multiply`,
   sutil sobre banners oscuros, marcado sobre claros).
4. **Migration de seed**: `insert into cosmetic_bundles (...) on conflict do
   nothing`. Precio editable por admin (`cb_admin_write`) — no hardcodear lógica
   de precio en código.
5. `THEME_RARITY` + rareza acorde. tsc + lint.

Verificá que la `key` del tema, el `bundleKey`, la key de `FALLBACK_BUNDLES` y
la key del seed coincidan exactamente (un mismatch deja el pack sin desbloquear).

## Admin governance (NO olvidar)

El catálogo de temas/bundles tiene su home admin en **`AdminCosmeticsScreen`**
(`/dashboard/admin/admin-cosmetics`). Siempre que toques temas, preguntá:
¿cómo lo lista/activa/pausa el admin sin abrir Supabase Studio?

- **Grants de bundles**: `grantBundleToUser` / `revokeBundleFromUser` (admin/cosmetics.ts).
- **Activar/desactivar temas**: tabla `theme_settings` (mig 129, ausencia=activo)
  + `setThemeActive(key, active)` (admin + `setAuditActor`; desactivar = hard-kill
  que revierte a Clásico). El picker oculta inactivos vía `getInactiveThemeKeys`;
  `setTheme` rechaza inactivos. `default` está protegido.
- Si agregás un eje nuevo que el admin deba controlar en runtime (ej. destacar un
  tema, fecha de lanzamiento), necesita: estado en DB + action admin con audit +
  sección en `AdminCosmeticsScreen`. No lo dejes "solo en código" si el negocio
  necesita cambiarlo sin deploy.

## Persistencia y render (no romper sincronía)

- `setTheme(themeKey)` escribe la key del tema en las 3 columnas de `profiles`
  (`accent_color`/`card_style`/`banner_preset`) vía `themeColumns(t)`.
- El render resuelve cada faceta con `findAccent`/`findBanner`/`findCardStyle`
  (derivados). Superficies: `ProfileScreen` (revalida ownership con
  `canUsePreset` — si perdés MP+/grant, cae a default), `AmigosScreen`,
  `TeamScreen` (FriendCard usa `f.accentHex`), `/api/v1/me`.
- **No cambia el schema** al agregar temas: siempre las mismas 3 columnas.

## CTAs teñidos por accent

Los CTAs primarios ("Agregar amigo", "Retar a match", "Compartir") se tiñen con
el `accentHex` del **dueño de la superficie**, texto vía `readableTextOn`, y
clase `.btn-accent` para el hover (`filter: brightness`, gateado a
`pointer:fine`, porque el background inline tapa el `:hover` de `.btn-primary`).
Botones globales sin dueño quedan neutros. Si agregás un CTA nuevo que deba
seguir el tema, reusá ese patrón — no inventes CSS por botón.

## Animaciones

Hoy los temas NO animan nada. Si querés sumar movimiento a una rareza alta
(shimmer/pulse), invocá **`emil-design-eng`** para easing/duración correctos y
respetá `prefers-reduced-motion`. Nada de glow estático (regla 1).

## Verificación (definition of done)

- `npx tsc --noEmit` y `npx eslint <archivos>` limpios.
- Keys consistentes en los 4 puntos (si es pack).
- Preview visual: el picker (`PersonalizacionScreenClient`) usa los componentes
  reales (`ProfileHeaderCard`, `FriendCard`, `StatCard`) — confirmá que el combo
  cierra y el texto es legible. Para un vistazo rápido podés armar un HTML
  temporal con los valores y screenshot con `agent-browser` (borralo después).
- Actualizá docs `architecture/20-database.md` §29.16/§29.20 si cambia el
  catálogo o el contrato.
- Si tocaste 3+ archivos: corré `matchpoint-logic-review`.

## Cuándo NO usar esta skill

- Cambios de UI ajenos a temas (otros componentes) → `matchpoint-ui-review`.
- Lógica de torneos/pagos/premium fuera de cosméticos → `matchpoint-docs-guide`.
