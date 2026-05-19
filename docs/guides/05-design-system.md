# Design system

> Tokens, componentes compartidos, easing curves y patrones de UI. Si vas
> a agregar UI, **leé esto primero** para no inventar paleta nueva ni
> animaciones random — todo está estandarizado.

## 1. Tokens

Definidos en `src/app/globals.css` (`@theme` y `:root`):

### Brand
| Token | Valor | Uso |
|---|---|---|
| `--primary` | `#10b981` | Acento principal (verde MatchPoint), CTAs, success |
| `--primary-hover` | `#059669` | Hover de primary |
| `--bg` | `#fafafa` | Fondo de página |
| `--card` | `#ffffff` | Fondo de cards |
| `--border` | `#e5e5e5` | Bordes neutros |
| `--muted` | `#f5f5f5` | Fondos secundarios, placeholders |
| `--muted-fg` | `#737373` | Texto muted |
| `--fg` | `#0a0a0a` | Texto principal |
| `--sidebar-bg` | `#09090b` | Negro absoluto del sidebar |

### Acentos secundarios (hardcoded, no en var)
- `#fbbf24` — amber/yellow (warnings, segundo lugar, fin de semana)
- `#dc2626` — red (cancelado, error, danger)
- `#0ea5e9` — sky blue (info, authorized)
- `#7c3aed` — purple (admin override, en revisión)
- `#f97316` — orange (disputado)

Cuando agregues un color: **primero buscá si hay uno aplicable**. No
inventes paleta nueva sin razón.

### Tipografía
- `--font-heading: "Plus Jakarta Sans"` — h1/h2/h3, KPIs, números grandes
- `--font-sans: "Inter"` — body, botones, todo lo demás

Heading típico: `font-weight: 900`, `letter-spacing: -0.02em` o `-0.03em`,
con un punto verde al final como detalle:

```tsx
<h1 className="font-heading">
  Mi torneo<span className="dot">.</span>
</h1>
```

`.dot` y `.tabular` (números tabulares) son clases utilitarias en
globals.css.

### Radios y sombras
- `border-radius: 14.4px` para cards (`--radius-mp-card`)
- `border-radius: 10px` para pills y botones medianos
- `border-radius: 9999px` para pills full-rounded
- Sombras suaves: `0 4px 12px rgba(0, 0, 0, 0.05)` para card-hover

## 2. Easing curves (animaciones)

Tres curvas estandarizadas en `:root`:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

**Reglas Emil-style**:

| Cuándo | Curva | Duración típica |
|---|---|---|
| Hover, enter de elementos UI | `--ease-out` | 140-200ms |
| Drawer / modal grande (off-screen) | `--ease-drawer` | 300-450ms |
| Movimiento on-screen (elemento que ya está visible) | `--ease-in-out` | 200-300ms |
| Stagger entre items en lista | `--ease-out` con delay incremental (~60ms entre cada) | 200-400ms total |
| Press feedback de botón | inline `transform: scale(0.97)` con `ease-out 120ms` | |

**NUNCA**:
- Usar `transition: all` — solo las props que cambian
- Usar curvas custom inline si una de las 3 estandarizadas aplica
- Animar más de 300ms en una interacción rápida (responsividad)

## 3. Componentes compartidos

### `<MpBarChart>` — barras verticales
Archivo: `src/components/dashboard/widgets/MpBarChart.tsx`

- SVG nativo (zero deps)
- Stagger animation al montar (28ms entre cada barra, ease-out MP)
- Hover tooltip on-brand (negro + Plus Jakarta + verde MP)
- Props: `data: MpBarDatum[]`, `height`, `accent`, `highlightLast`,
  `weekendPattern`, `fmtValue`, `ariaLabel`

```tsx
<MpBarChart
  data={[{ label: "Hoy", value: 12000 }, ...]}
  height={200}
  weekendPattern
  fmtValue={(v) => `$${Math.round(v / 100).toLocaleString("en-US")}`}
/>
```

**Usado en**: AdminMetrics (GMV 30d), ClubFinanzas (revenue 30d).

### `<MpProgressBar>` — barra de progreso horizontal
Archivo: `src/components/dashboard/widgets/MpProgressBar.tsx`

- Fill animado de 0% al target (ease-out, 700ms default)
- Props: `pct` (0-100), `height`, `color`, `trackColor`, `radius`,
  `durationMs`, `delayMs`

```tsx
{items.map((item, i) => (
  <MpProgressBar key={item.id} pct={item.pct} delayMs={i * 60} />
))}
```

**Usado en**: AdminMetrics (deportes), ClubFinanzas (breakdown),
ClubReportes (deportes), PartnerFinanzas (revenue por torneo).

### `<RatingSparkline>` — line chart con hover
Archivo: `src/components/dashboard/widgets/RatingSparkline.tsx`

- SVG nativo, area + line
- Crosshair vertical en hover + dot snap + tooltip negro
- **Referencia del estilo tooltip** que usamos en todo el design system.

### `<RSTable>` y `<RSPill>`
`src/components/dashboard/widgets/RS.tsx` — tabla y pill genéricos
usados en todo el dashboard admin.

⚠️ `RSTable` envuelve con `overflow: hidden`. Si necesitas un dropdown
absoluto en una row → usar **portal** (`createPortal` a `document.body`)
o el dropdown queda clipped. Pattern visto en `AdminUsersScreenView` (row
menu via portal).

### Modales
`src/app/globals.css` define:

```css
.mp-modal-backdrop {
  background: rgba(0, 0, 0, 0.55);
  animation: mpModalBackdropIn 200ms var(--ease-out);
}
.mp-modal-panel {
  animation: mpModalPanelIn 240ms var(--ease-drawer);
}
```

Patrón:
```tsx
<div className="mp-modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
  <div className="mp-modal-panel" onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, ... }}>
    {/* contenido */}
  </div>
</div>
```

### Botones
- `.btn` — base (pill, uppercase, 800 weight, ease-out scale press)
- `.btn-primary` — verde
- `.btn-outline` — outline negro
- Custom inline: respetar `border-radius: 9999`, `font-weight: 800`,
  `letter-spacing: 0.04em`, `text-transform: uppercase`

## 4. Status pills (helpers)

### Transactions
`src/lib/ui/transaction-status.ts` — exporta `txStatusMeta(status)` con
`{label, color, background, tooltip}` para los 8 estados de
`mp_payment_status`.

```tsx
import { txStatusMeta } from "@/lib/ui/transaction-status";
const m = txStatusMeta(tx.status);
<span title={m.tooltip} style={{ color: m.color, background: m.background, ... }}>
  {m.label}
</span>
```

### Otros enums
Cuando definas un nuevo enum (tournament status, registration status,
etc) — **crear un helper similar**. NO mapear inline (regresión visual).
Patrón:

```ts
const META = {
  draft: { label: "Borrador", color: "...", background: "..." },
  registration_open: { label: "Abierto", ... },
  // ... cubrir TODOS los valores del enum
};
const FALLBACK = { label: "—", color: "var(--muted-fg)", ... };

export function statusMeta(status) {
  return META[status] ?? FALLBACK;
}
```

## 5. Reglas Emil-style (acumuladas)

1. **Botones press**: siempre `transform: scale(0.97)` + transition rápido.
2. **Modal backdrop**: opacidad 0.55 (no negro puro, no demasiado lavado).
3. **No animar entrada con `scale(0)`** — siempre desde `scale(0.95)` o
   superior para que sea perceptible que viene de "algún lado".
4. **Popover origin-aware**: `transform-origin` del trigger, no del centro.
5. **Tooltip skip-delay** después del primero abierto — UX más fluido.
6. **Spring para gestos**, duración para clicks. Hoy no usamos springs.
7. **No usar `ease-in`** salvo casos muy específicos (parece sluggish).

Ver `skills/emil-design-eng` skill del agente para más detalle.

## 6. Feedback rule: no side style changes

**Regla absoluta** (de memoria del usuario): si la tarea es funcional
(arreglar bug, agregar feature), **no** meterle polish visual extra en la
misma tanda. Cambios de color/hover/animación se piden aparte para revisar.

Si ves algo feo mientras arreglas un bug y quieres mejorarlo: anótalo y
preguntá antes de tocar.

## 7. Charts: catálogo

Ver `audit de gráficos` en logs previos. Resumen:

| Tipo | Archivo | Datos | Página |
|---|---|---|---|
| Bar (30d) | MpBarChart compartido | query | AdminMetrics, ClubFinanzas |
| Progress bar | MpProgressBar compartido | query/computed | varias |
| Sparkline rating | RatingSparkline | ranking_snapshots | UserHome, Ranking |
| Heatmap 7×24 | inline en `ClubReportesScreenView`/`HeatmapGrid` | reservations | Manager Reportes |
| Waterfall texto | inline `PartnerFinanzasScreenView` | query | Partner Finanzas |

100% sin librerías externas (no recharts, victory, visx). Bundle chico.

## 8. Iconos

`<Icon name="..." size={N} color="..." />` — wrapper sobre lucide-react
(probablemente). Lista de nombres usados habitualmente: `check`, `x`,
`alert-triangle`, `info`, `pencil`, `trash-2`, `plus`, `arrow-left`,
`arrow-right`, `chevrons-up-down`, `more-horizontal`, `trophy`, `calendar`,
`users`, `building-2`, `dollar-sign`, `star`, `crown`, `shield`, `flag`,
`rocket`, `lock`, `eye`, `eye-off`, `external-link`.

## 9. Reglas finales

1. **Siempre usar var de color** antes que hex literal (excepto los amber/
   red/sky enumerados arriba — esos son consistentes y entendidos).
2. **Heading + dot verde** es la marca visual de MP. Úsalo en h1/h2 de
   sections importantes.
3. **MPR ≠ DUPR**. Si ves DUPR en algún copy: bug. Renombrar.
4. **Animaciones consistentes**: si dudas, usar `--ease-out` 200ms.
5. **No uses emojis decorativos** salvo que el user pida explícitamente.

## 10. Logo oficial · "● MATCHPOINT"

El logo oficial son **dos elementos** que aparecen juntos:

```tsx
<span className="dot">●</span>
<span className="font-heading" style={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
  MATCHPOINT
</span>
```

- **`●` con `className="dot"`** → color `var(--primary)` (#10b981).
- **wordmark `MATCHPOINT`** → font-heading (Plus Jakarta Sans), weight 900,
  letterSpacing `-0.02em`, mayúsculas.

Lugares canónicos donde vive el logo (referencia visual):

| Lugar | Tamaño dot | Tamaño wordmark | Contexto |
|---|---|---|---|
| `landing/Nav.tsx` | 22px | 20px | nav landing |
| `landing/Footer.tsx` | 22px | 22px | footer landing |
| `dashboard/DashboardSidebar.tsx` | 20px | 18px | sidebar dashboard |
| `dashboard/TopBar.tsx` (mobile) | 16px | 15px | topbar mobile compact |

**Como avatar/símbolo standalone** (cuando solo cabe el símbolo, no el
wordmark — ej. avatar circular del bot oficial en `/amigos` o `/chat`):

```tsx
<div style={{ background: "#0a0a0a", borderRadius: "50%", width: 64, height: 64,
              display: "flex", alignItems: "center", justifyContent: "center" }}>
  <span className="dot" style={{ fontSize: 28, lineHeight: 1 }}>●</span>
</div>
```

Fondo negro `#0a0a0a` + dot verde grande. **No usar "M"** ni inicial — eso
es para usuarios normales con `initials(name)`.

**Anti-patrón**: avatares del bot MATCHPOINT con `<span>M</span>` o
iniciales sobre gradiente verde. El dot verde es la marca, no la "M".
