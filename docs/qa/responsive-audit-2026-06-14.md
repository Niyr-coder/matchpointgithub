# Responsive audit · 2026-06-14

Re-scan de inline styles que rompen mobile-first, alineado con
`docs/guides/06-responsive.md`. Regenerable con:

```bash
node scripts/responsive-audit.mjs          # resumen + lista HIGH
node scripts/responsive-audit.mjs --json    # detalle completo
```

## Qué detecta y por qué

Layout que **cambia entre breakpoints** (grids de N columnas, 2-col,
paddings de sección) no debe vivir inline: un `style={{ gridTemplateColumns }}`
no tiene variante `md:` y no stackea ni se contiene en mobile.

| Regla | Significado |
|---|---|
| `inline-wide-table-grid` | grid con ≥2 columnas de px fijos inline → ancho fijo que desborda en mobile |
| `inline-repeat-grid` | `repeat(N, 1fr)` inline con N≥3 → no stackea; con N≥6 celdas ilegibles en mobile |
| `inline-two-col-layout` | grid `1fr 1fr` inline → no colapsa a 1 columna |
| `inline-section-padding` | padding ≥40px inline → márgenes enormes en pantallas chicas |

**Distinción clave (contenido vs page-overflow):** una grid ancha **dentro de
un wrapper de scroll** (`.mp-table-scroll`, `overflowX:auto`, o un `minWidth`
fijo) hace scroll horizontal **dentro de la card** → aceptable, severidad baja.
La misma grid **sin** ese wrapper desborda la página entera → **HIGH**. El
scanner clasifica por archivo: si el archivo tiene señal de wrapper, sus tablas
se consideran contenidas.

## Resumen (estado 2026-06-14)

- **227** candidatos totales · **40 HIGH** (page-overflow real) · 34 contenidos · 153 medios.
- HIGH = 24 `wide-table-grid` + 16 `repeat-grid`.
- HIGH por superficie: **admin 13**, **user 9**, **employee 5**, modals 4,
  coach 2, giveaways 2, manager 2, club 1, owner 1, otro 1.

Los **medios** (93 `two-col-layout` + 15 `section-padding`) son menor prioridad:
muchos `1fr 1fr` inline son pares de botones que toleran no colapsar; revisar
solo donde el contenido de cada columna sea ancho (texto/inputs largos).

## Resultado de la ejecución (6 tandas paralelas)

Se aplicaron **13 wraps reales** (`.mp-table-scroll`/`pv3-scroll-x` + `minWidth`)
en: AdminFlagsScreenView, AdminRecepcionScreenView, ProfileScreenView,
PerfilV2Sections, PrizesEditor, EmployeeCaja/Checkin/Home, CarritoModal,
RetarModal, ClubReportesScreenView. Typecheck limpio.

De los 40 HIGH originales, **~20 eran falsos positivos** ya cubiertos por
patrones que el scanner v1 no reconocía: clases de scroll bespoke
(`.mp-audit-stream-scroll`, `.mp-metrics-heatmap-scroll`,
`.mp-coach-calendar-scroll`, `.mp-stf-schedule-scroll`), el componente
`<RSTable>` (envuelve en `mp-table-scroll`), grids `hidden md:grid`
(desktop-only con variante mobile aparte), y tablas que **restackean** a card
en mobile vía `data-label` (`.mp-admin-event-reg-*`). El scanner se actualizó
para reconocer `*-scroll`, `RSTable` y `md:grid`.

**Re-scan tras fixes: 7 HIGH**, todos verificados como NO-riesgo (restacking
CSS, desktop-only, identicon decorativo, o pocas px fijas + `1fr` que comprime):
`AdminRolesScreenView:407`, `EventRegistrationsTable:81`,
`TournamentRegistrationsTable:68`, `MyGiveawaysViewClient:563`,
`MisMembresiasScreenView:317`, `UserHomeView:622`, `GiveawayPrereqSheet:103`.
La deuda real de page-overflow está cerrada.

## Fix canónico

**Tablas (wide-table-grid):** envolver en el wrapper de scroll contenido que ya
existe (`.mp-table-scroll`, globals.css), igual que `AdminReservasScreenView`:

```jsx
<div className="card mp-table-scroll" style={{ padding: 0, overflow: "hidden" }}>
  <div style={{ minWidth: 720 }}>
    {/* cabecera + filas con el gridTemplateColumns ancho intactos */}
  </div>
</div>
```

**Visualizaciones repeat(N) (heatmaps, calendarios):** o mismo wrapper
`.mp-table-scroll`, o mover el grid a una clase con `grid-cols` responsive
(`grid-cols-[50px_repeat(7,1fr)]` desktop, menos columnas / scroll en mobile).

No se debe cambiar el layout desktop — solo contener/stackear en mobile.

## HIGH — backlog priorizado

### admin (13)
- `admin/AdminAuditScreenView.tsx:70` — wide-table-grid
- `admin/AdminBroadcastScreenView.tsx:100` — wide-table-grid
- `admin/AdminBroadcastScreenView.tsx:273` — wide-table-grid
- `admin/AdminEventsScreenView.tsx:57` — wide-table-grid
- `admin/AdminFlagsScreenView.tsx:253` — wide-table-grid
- `admin/AdminFlagsScreenView.tsx:861` — wide-table-grid
- `admin/AdminMetricasView.tsx:311` — repeat-grid (heatmap repeat(24))
- `admin/AdminMetricasView.tsx:321` — repeat-grid (heatmap repeat(24))
- `admin/AdminRolesScreenView.tsx:407` — wide-table-grid
- `admin/event-detail/EventRegistrationsTable.tsx:81` — wide-table-grid
- `admin/tournament-detail/TournamentRegistrationsTable.tsx:68` — wide-table-grid
- `admin/_juego/AdminRecepcionScreenView.tsx:149` — repeat-grid
- `admin/_juego/AdminRecepcionScreenView.tsx:173` — repeat-grid

### user (9)
- `user/MisMembresiasScreenView.tsx:317` — repeat-grid
- `user/profile-v3/PerfilV2Sections.tsx:136` — wide-table-grid
- `user/profile-v3/PerfilV2Sections.tsx:240` — repeat-grid
- `user/profile-v3/PerfilV2Sections.tsx:283` — wide-table-grid
- `user/profile-v3/PerfilV2Sections.tsx:434` — repeat-grid
- `user/profile-v3/PerfilV3.tsx:72` — repeat-grid
- `user/ProfileScreenView.tsx:1040` — repeat-grid
- `user/quedada-fields/PrizesEditor.tsx:71` — wide-table-grid
- `user/UserHomeView.tsx:622` — wide-table-grid

### employee (5)
- `employee/EmployeeCajaScreenView.tsx:59` — wide-table-grid
- `employee/EmployeeCheckinScreenView.tsx:35` — wide-table-grid
- `employee/EmployeeCheckinScreenView.tsx:236` — wide-table-grid
- `employee/EmployeeHomeView.tsx:63` — wide-table-grid
- `employee/EmployeeHomeView.tsx:280` — wide-table-grid

### modals (4)
- `modals/CarritoModal.tsx:802` — wide-table-grid
- `modals/CarritoModal.tsx:827` — wide-table-grid
- `modals/CarritoModal.tsx:1234` — wide-table-grid
- `modals/RetarModal.tsx:1317` — repeat-grid

### coach (2)
- `coach/CoachCalendarScreenView.tsx:73` — repeat-grid (calendario `50px repeat(7,1fr)`)
- `coach/CoachCalendarScreenView.tsx:100` — repeat-grid

### giveaways (2)
- `giveaways/MyGiveawaysViewClient.tsx:504` — wide-table-grid
- `giveaways/MyGiveawaysViewClient.tsx:563` — wide-table-grid

### manager (2)
- `manager/ClubReportesScreenView.tsx:271` — repeat-grid
- `manager/ClubReportesScreenView.tsx:661` — repeat-grid

### club / owner / otro (3)
- `club/ClubStaffView.tsx:133` — repeat-grid (`repeat(17,1fr)`)
- `owner/config-sections/HorariosSection.tsx:194` — repeat-grid
- `components/giveaways/GiveawayPrereqSheet.tsx:103` — wide-table-grid

## Verificación

Tras cada fix, confirmar en mobile (375px) que no hay scrollbar horizontal de
**página** (el scroll dentro de la card sí es válido):

```bash
npx agent-browser open <url> && npx agent-browser screenshot mobile.png
```
