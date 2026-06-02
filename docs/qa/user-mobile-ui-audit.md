# Auditoría UI móvil — dashboard `user`

Fecha de referencia: 2026-06-02 (actualizado tras fixes CSS). Viewport de prueba: **390×844** (Playwright / iPhone 14 class).

## Cómo reproducir

```bash
npm run test:e2e:mobile
# o
npm run test:e2e -- tests/e2e/user-mobile-responsive.spec.ts
```

Variables opcionales: `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` (default `qa-player@matchpoint.test` / `QaTest1234!` del seed QA).

---

## Resumen ejecutivo

| Estado | Área | Nota |
|--------|------|------|
| Mitigado | Perfil v3 | `pv3-stack-sm`, `pv3-scroll-x`, padding móvil en `profile-v3.css` |
| Mitigado | Busco partido | Vista lista oculta en &lt;768px; cards `min(100%,310px)`; hero en columna |
| Mitigado | Mi plan | Card y tabla beneficios en 1 columna en móvil |
| Mitigado | Eventos | Tabs con scroll horizontal contenido |
| Pendiente | Mensajes | Composer vs bottom nav |
| Pendiente | Quedadas | Modales ~720px |
| Pendiente | Amigos | Orden en breakpoint `md` |
| OK | Home user | Sin overflow grave en E2E |

---

## Hallazgos por pantalla

### 1. Perfil (`ProfileScreenView` / `profile-v3`)

**Síntomas:** scroll horizontal, hero cortado, bandas analíticas ilegibles.

**Causa raíz:** `PerfilV3.tsx`, `PerfilV2.tsx` y `PerfilV2Sections.tsx` usan `gridTemplateColumns` fijos (`repeat(4,1fr)`, `1.7fr 1fr 0.85fr`, `156px 1fr auto`) y padding `24px`/`28px` sin media queries en `profile-v3.css` (solo hay reglas de tipografía).

**Fix recomendado:**

- En `profile-v3.css`, media `@media (max-width: 768px)`:
  - `grid-template-columns: 1fr` en bandas analytics/social/scout
  - Hero en columna (avatar centrado, CTAs full width)
  - Ocultar o apilar tablas scout de 6 columnas
- Sustituir grids inline en V3 por clases responsive de Tailwind o CSS module

### 2. Busco partido (`BuscoPartidoScreenView.tsx`)

**Síntomas:** en vista **lista**, tabla de avisos desborda; header del lobby `gridTemplateColumns: 1.5fr auto 1fr` no colapsa.

**Causa:** columnas fijas en px (`110px 1.5fr 1fr 130px…`) y `minmax(310px, 1fr)` en cards.

**Fix recomendado:**

- En móvil forzar vista **cards** (default) y ocultar toggle lista o mostrar cards apiladas
- Reemplazar tabla lista por cards en `< md`
- Reducir padding `24px 28px` → `16px` en móvil

### 3. Mensajes (`MensajesScreenView.tsx`)

**Síntomas:** espacio muerto bajo composer; a veces doble scroll.

**Lo que está bien:** patrón WhatsApp (`max-lg:hidden` lista vs hilo) implementado correctamente.

**Pendiente:** `DashboardChrome` usa `max-lg:pb-[4.75rem]` en chat; revisar que composer no quede bajo el pill nav. E2E valida lista/hilo.

### 4. Quedadas (`QuedadasScreenView.tsx`)

**Síntomas:** modal detalle ~720px, chips de filtro en scroll horizontal agresivo.

**Fix:** modales `width: min(100vw - 32px, 720px)`; filtros en 2 filas en móvil.

### 5. Amigos (`AmigosScreenView.tsx`)

**Síntomas:** en algunos anchos el aside (solicitudes) queda arriba del feed (`order-1 lg:order-none`) — correcto en móvil, confuso en `md` intermedio.

**Fix:** en `md` usar una sola columna hasta `lg`.

### 6. Home (`UserHomeView.tsx`)

**Estado:** aceptable; grids colapsan a 1 columna. Bottom nav + `pb-24` en main evitan solapamiento.

### 7. Eventos (`/dashboard/user/eventos`)

**Síntomas:** overflow ~120px en 390px (filtros/chips en fila).

**Fix:** chips en wrap o scroll contenido dentro de `main` sin empujar el documento.

### 8. Clubes / Ranking

**Estado:** mayormente cards responsive; vigilar mapas Leaflet en altura baja.

### 8. Mi plan / MATCHPOINT+ (`MiPlanScreenView`, `MpPlusManageView`)

**Síntomas:** tablas de beneficios con muchas columnas; comparación free vs plus ilegible en 390px.

**Fix:** en móvil mostrar cards por beneficio en lugar de tabla.

---

## Chrome del dashboard (global)

| Pieza | Comportamiento móvil |
|-------|----------------------|
| `MobileBottomNav` | Visible `md:hidden`, primeros 3 ítems + “Más” |
| Sidebar | Oculto; drawer vía “Más” |
| `main` padding | `p-4`, chat `pb-[4.75rem]`, resto `pb-24` |

---

## E2E añadido

Archivo: `tests/e2e/user-mobile-responsive.spec.ts`

- Login jugador QA
- Recorrido 10 rutas user
- Assert sin overflow (rutas sanas)
- Assert de overflow en todas las rutas user (sin `fixme` tras fixes 2026-06-02)
- Casos específicos mensajes (lista/hilo)

---

## Prioridad de fix sugerida

1. **Perfil v3** — media queries + hero stack (impacto en toda visita a perfiles)
2. **Busco partido** — ocultar vista lista en móvil o responsive table
3. **Mi plan** — tabla → cards (E2E: ~186px overflow en 390px)
4. **Quedadas modales** — ancho fluido
5. Pulido mensajes (composer vs bottom nav)

---

## Reglas para el dev

Al tocar UI user en móvil:

- Evitar `gridTemplateColumns` con más de 1 columna sin `@media (min-width: …)`
- Preferir `min-w-0`, `overflow-hidden`, `truncate` en filas de listas
- Probar siempre en 390px antes de merge
- Correr `npm run test:e2e:mobile` en CI opcional (job separado)
