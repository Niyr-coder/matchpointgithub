---
name: matchpoint-ui-review
description: Revisa UI recién implementada en MatchPoint v2 contra el checklist de "cosas que no pueden fallar" — layout que se rompe con contenido variable, botones sin :active feedback, conflictos de class CSS con inline styles, falta de truncation en text overflow, hover states sin gate de pointer:fine, animaciones que violan Emil. Úsala DESPUÉS de implementar/editar cualquier componente con interacción visual (cards, listas, formularios, modales, buttons, tabs, dropdowns, drawers). Complementa `emil-design-eng` (principios) y `matchpoint-feature-plan` (planning) — esta hace el QA del implementado. Ejecuta verificaciones programáticas (lint emit, grep de antipatrones) y opcionalmente smoke-test visual con agent-browser.
---

# MatchPoint UI Review

Skill de QA post-implementación para UI. Atrapa los bugs visuales que recurren en MatchPoint:

- Layout que se rompe cuando el label/contenido cambia de tamaño (botones sin nowrap, cards sin minmax columnar).
- Botones que heredan `.btn` (pill 9999px + padding 10px 18px) y conflictan con inline styles del consumer.
- Tailwind `hidden` o `block` que NO funciona porque `globals.css` se carga después y `.btn { display: inline-flex }` gana.
- Hover states que disparan en touch devices.
- Animaciones que violan Emil (scale(0), ease-in, transition:all, duración >300ms en UI cotidiana).
- Texto sin `whiteSpace: nowrap` + `textOverflow: ellipsis` en celdas de ancho fijo.
- Componentes que no respetan `prefers-reduced-motion`.
- Inline `transformOrigin: "center"` en popovers anchored (debe ir desde el trigger).

## Cuándo se dispara

DESPUÉS de implementar o editar:

- Cards en grids (`auto-fill minmax(...)`, `grid-cols-N`, etc).
- Botones nuevos (especialmente con `.btn` class + inline overrides).
- Listas con elementos dinámicos (search results, friend cards, message rows).
- Modales, drawers, popovers, dropdowns.
- Tabs y filtros con state.
- Cualquier componente con hover/active states.
- Animaciones nuevas (entrada, salida, transitions de state).

NO se dispara para:

- Server actions / lógica de negocio puras.
- Migrations SQL.
- Refactor que no toca render.
- Cambios de copy sin layout.

## Cómo aplicarla

### Paso 1 — Identificar el componente bajo review

El user dice "revisá X" o tras una implementación reciente, identificar:

- Archivo(s) tocado(s).
- Función/componente específico dentro del archivo.
- Estados que tiene (hover, active, disabled, loading, empty, error).

### Paso 2 — Checklist programático (grep + lint)

Correr verificaciones automáticas sobre el archivo:

#### 2.1 — Conflictos CSS (`.btn` + inline)

```bash
grep -n 'className="btn[^"]*"' <archivo> | xargs -I{} echo {}
```

Para cada match, verificar que **no** se pasen properties via `style` que choquen con `.btn`:
- `padding` (`.btn` define `10px 18px`)
- `border-radius` (`.btn` define `9999px` — pill)
- `display` (`.btn` define `inline-flex`)
- `background` y `color` (sí pueden override, pero verificar que sea intencional)

**Anti-patrón rojo**: `<button className="btn" style={{ padding: "8px 12px", borderRadius: 10 }}>` → el padding se sobrescribe pero el borderRadius compite con la pill. Resultado: visualmente inconsistente.

**Fix**: o (a) sacar `.btn` y declarar el botón con inline completo + clase reusable propia, o (b) NO override propiedades que `.btn` ya define.

#### 2.2 — Tailwind `hidden` que no funciona

```bash
grep -n 'className="[^"]*btn[^"]*hidden' <archivo>
grep -n 'className="[^"]*hidden[^"]*btn' <archivo>
```

Si match: usar `!hidden md:!inline-flex` (Tailwind important) porque `.btn { display: inline-flex }` se carga después y gana.

#### 2.3 — Text overflow sin truncation

```bash
grep -n 'whiteSpace.*nowrap' <archivo>  # debería estar presente en celdas de ancho fijo
```

En cards en grid con `minmax(220px, 1fr)`: cualquier `<div>` que muestre `display_name`, `username`, `city`, etc — debe tener trío: `whiteSpace: nowrap`, `overflow: hidden`, `textOverflow: ellipsis`.

#### 2.4 — Hover states sin gate de pointer

```bash
grep -n ':hover' <archivo-css>
```

Para cada `:hover` que use transform/scale/color shift, verificar que esté dentro de `@media (hover: hover) and (pointer: fine)`. Sin el gate, touch devices disparan hover al tap.

#### 2.5 — Animaciones Emil-compliant

```bash
grep -E 'transition: all|scale\(0\)|ease-in[^-]|animation:.*[3-9][0-9]{2,}ms' <archivo-css>
grep -nE '"transition: all|"scale\(0\)|"ease-in [^-]' <archivo-tsx>
```

Anti-patrones a flagear:
- `transition: all` → especificar property exacta.
- `scale(0)` entry → mínimo `scale(0.95)` + opacity 0.
- `ease-in` en UI → reemplazar con `ease-out` o `var(--ease-out)`.
- `animation: X 400ms` o más en UI cotidiana (dropdowns, popovers, buttons) → reducir a 150-250ms.
- `transform-origin: center` en popovers anchored → debe matchear el trigger.

#### 2.6 — Botones sin `:active` feedback

Cualquier botón clickable debería tener `transform: scale(0.97)` en `:active` con `transition: transform 160ms ease-out`. Sin esto, no hay sensación de "presioné el botón".

#### 2.7 — `prefers-reduced-motion` respetado

Si hay `@keyframes` o `animation:` en globals.css, debe haber un bloque:

```css
@media (prefers-reduced-motion: reduce) {
  .<clase> { animation: none; }
}
```

#### 2.8 — TS limpio

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Sin errores. Si hay, fijar antes de seguir.

#### 2.9 — Action call ↔ Schema (Zod) keys match

Cuando el componente hace una llamada a server action con un objeto:

```ts
const r = await sendFriendRequest({ userId: target.userId });
```

Verificar que las keys matchean el schema Zod del action. TS no atrapa
esto porque las server actions reciben `unknown` y validan en runtime.
Resultado: el user ve un toast "Invalid input" en producción.

Para cada call a server action en el archivo bajo review:

1. Grep el `Schema` que usa el action correspondiente
   (ej. `SendFriendRequestSchema` en `src/lib/schemas/social.ts`).
2. Comparar las keys del schema con las del payload.
3. Si difieren, fijar el call site.

Si tenés `runAction(SchemaName, input, async ({ key1, key2 }) => ...)`
en el server, las keys destructuradas son la fuente de verdad.

### Paso 3 — Verificación visual con agent-browser (opcional)

Para componentes críticos (búsqueda, listas, formularios, modales), correr smoke test visual:

```bash
npx agent-browser set viewport 390 844  # iPhone 14
npx agent-browser open http://localhost:3000/<ruta>
npx agent-browser screenshot mobile.png
npx agent-browser set viewport 1440 900  # desktop
npx agent-browser open http://localhost:3000/<ruta>
npx agent-browser screenshot desktop.png
```

Verificar en las screenshots:

- Sin scrollbar horizontal (`document.documentElement.scrollWidth === clientWidth`).
- Botones no se aplastan ni desbordan con labels largos.
- Avatares + nombre + acción en un row caben sin overlap.
- Cards en grid responsive: stackean en mobile o usan `.mp-cards-row` carrousel.
- Modales/drawers: scale-in desde el origin correcto.

### Paso 4 — Test de contenido extremo

Forzar el peor caso del contenido para detectar layouts frágiles:

- Display name de 40+ caracteres ("Maximiliano Echeverría Rodríguez").
- Username muy largo o con caracteres especiales.
- Lista vacía (empty state cubierto?).
- Lista con 1 elemento (no rompe layout calculado para N?).
- Lista con 100 elementos (paginación / scroll?).
- Mobile 360px de ancho.

Cualquier rompimiento = bug a fijear.

### Paso 5 — Reportar con tabla Before/After

Output al user en formato del review checklist de Emil:

```
## Review UI: <componente>

### Issues encontrados

| Before | After | Why |
|---|---|---|
| `<código actual>` | `<código sugerido>` | <razón breve> |

### Verificación
- TS: ✅/❌
- Lint: ✅/❌
- agent-browser mobile/desktop: ✅/❌ (con screenshots si aplica)
- Edge cases (texto largo, lista vacía, etc): ✅/❌

### Aplicar fixes ya?
```

Si el user dice sí, aplicar. Si no, dejar el reporte.

## Cosas a evitar

- **Review sin contexto del componente**: leer 1 archivo no es review; leer el archivo + sus consumers + el globals.css relevante sí.
- **Sugerir fixes sin justificar contra Emil**: cada anti-patrón tiene un porqué documentado en `emil-design-eng`.
- **Olvidar el media query de hover**: 99% de los hover en code no lo tienen, y rompen mobile.
- **Aprobar sin TS pass**: si el archivo no compila, los fixes son más urgentes que el polish.

## Cómo se conecta con las otras skills

- `emil-design-eng` → fuente de verdad de principios (qué hacer / no hacer).
- `matchpoint-feature-plan` → al planear feature, sección §2.3.b ya menciona invocar Emil. Esta skill (`matchpoint-ui-review`) hace el closing de loop: post-implementación verifica que se aplicó.
- `matchpoint-docs-guide` → si los issues afectan algo documentado, actualizar el doc en la misma tanda.
- `matchpoint-logic-review` → si encontrás botones sin onClick, redirects faltantes
  post-action, o entidades searchable que dan 404, son gaps de coherencia
  funcional. Delegar a esa skill para los pasos §8-§10.

## Delegación activa

Durante la review, si caés en categorías fuera del scope visual:

| Hallazgo | Delegar a |
|---|---|
| Animación con easing/duración fuera de los rangos Emil | `emil-design-eng` para el valor exacto |
| Botón visible sin onClick / form sin onSubmit | `matchpoint-logic-review §8.1` |
| Action call con keys que no matchean el schema Zod | `matchpoint-logic-review §4` |
| Falta `hrefForKind` para un notification_kind nuevo | `matchpoint-logic-review §10` (complementos) |
| Doc desactualizada con el patrón aplicado | `matchpoint-docs-guide` para releer + sugerir update |

## Cuando NO usar esta skill

- Pull request final / review humano: esta skill prepara, no reemplaza ojo humano.
- Refactor estructural (mover archivos, renombrar): el visual no cambia.
- Backend puro: nada UI que revisar.
