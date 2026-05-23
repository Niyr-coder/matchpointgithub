# Placeholders, stubs y WIP

> Inventario honesto de qué está fake / hardcoded / a medio armar. Si vas a
> implementar una feature aquí, **leé este doc primero** — probablemente ya
> hay un placeholder al que tienes que reemplazar (no agregar otro paralelo).

Convención:
- 🔴 **Mentira visible** — el UI muestra un valor falso al usuario real
- 🟡 **Placeholder honesto** — visible y marcado como "Próximamente" o stub
- 🟢 **Stub interno** — solo lo ven devs, no afecta UX

---

## 1. 🔴 Hardcodes pendientes de migrar

### `DEFAULT_COMMISSION_PCT = 0.2` — fallback coach
- **Archivo**: `src/components/dashboard/coach/CoachPagosScreen.tsx:6`
- **Estado**: Mejorado vs antes (ahora es solo fallback cuando no hay row
  en `coach_commissions`). Pero el 20% sigue siendo arbitrario.
- **Para quitarlo**: migrar a `platform_config.default_coach_commission_pct`
  + actualizar helper.

### Curvas easing en lugar de tokens
- **Archivo**: cada style inline que usa `cubic-bezier(0.23, 1, 0.32, 1)`
  directo.
- **Estado**: Funciona pero duplicado. `globals.css` tiene `--ease-out`,
  `--ease-in-out`, `--ease-drawer` definidos.
- **Para quitarlo**: barrido global reemplazando literal por var. NO urgente.

### Default `max_participants = 32` al crear torneo
- **Archivo**: `src/components/dashboard/partner/CreateTournamentFlow.tsx`
- **Estado**: Default UI razonable, pero asume "torneo típico".
- **Para quitarlo**: migrar a `platform_config.default_tournament_max_participants`.

---

## 2. 🟡 Placeholders honestos (visibles + marcados)

### Team Settings — 3 toggles persistidos pero NO enforzados
- **Archivo**: `src/components/dashboard/user/TeamScreenView.tsx` (const `SETTING_ROWS`, tab `TeamSettings`).
- **Estado**: la mig 164 agregó 4 cols boolean a `teams`. La UI cablea los 4
  toggles a `updateTeamSettings` (persisten en DB). Pero solo
  `require_join_approval` cambia comportamiento real (consumido en
  `requestJoinTeam` → auto-accept). Los otros 3 muestran badge "Pronto" al
  lado del label:
  - `captain_only_invites` → necesita rol de co-capitán (`team_members.role`
    enum hoy solo tiene `captain|player|substitute`).
  - `show_in_ranking` → necesita ranking de teams (`mv_user_ranking` solo
    es de users; no existe view equivalente para teams).
  - `allow_external_chat_guests` → necesita chats team-vs-team (Arena no
    existe; los chats de match actuales son individuales).
- **Para quitarlo**: cuando se implemente cada feature, leer la col
  correspondiente en su flujo y borrar el badge "Pronto" en `SETTING_ROWS`.

### Team Achievements — ✅ MERGEADO (admin UI cableada)
- **Estado**: completamente operativo. `AdminUserTeamsScreen` (rediseño del kit)
  cableado a `grantTeamAchievement` con modal real (kind + title + subtitle).
  `TeamHome` consume real; empty state honesto si no hay grants. Sigue
  habilitado para auto-grant futuro cuando exista Arena/leagues (trigger
  SECURITY DEFINER llamando a `grantTeamAchievement` directamente).

### Team policy editor (admin) — solo team_caps editable, resto aspiracional
- **Archivo**: `src/components/dashboard/admin/AdminUserTeamsScreenView.tsx`
  (`PolicyEditorModal`).
- **Estado**: el modal "Política de teams" del rediseño linkea a
  `Admin · Configuración → team_caps` (único campo real editable hoy via
  `platform_config`). Los otros campos del kit (auto-archivo, aprobación de
  nombre con marca registrada, transfer-on-inactive, ranking público de
  teams) son aspiracionales — no existe el cron ni la política de moderación
  automática.
- **Para quitarlo**: implementar (1) cron `fn_auto_archive_idle_teams`
  configurable, (2) revisión de nombres con marca via cola de moderación,
  (3) `mv_team_ranking` con su gating de visibilidad, (4) `transferOnInactive`
  como flag global que dispare `forceTransferCaptainAdmin` automático.

### Motor de juego de Quedadas — formatos no-Americano "Pronto"
- **Archivos**: `QuedadaManagePanel.tsx` (sub-tab Juego) + `QuedadaDetailView.tsx`.
- **Estado**: el motor de juego rediseñado (mig 141) entrega **Americano** en
  Stage 1. Los demás formatos (`round_robin`, `mexicano`, `kotc`, `canguil`,
  `libre`) muestran una tarjeta honesta "Pronto" en la zona de Juego (gestión y
  detalle del jugador). El resto del flujo (organizar, parejas, pagos, cierre)
  funciona para todos los formatos.
- **Para quitarlo**: Stage 2 — implementar el motor por formato (round_robin →
  mexicano → kotc → canguil → libre) reusando el patrón de Americano. Ver
  `docs/product/06-quedadas.md`.
- **Guard**: `generateAmericanoRound` corta con `QUEDADAS.FORMAT_UNSUPPORTED` si
  el formato no es americano (no se puede generar ronda por error).

### Página de gestión de Quedadas — solo header (reestructuración paso a paso)
- **Archivo**: `src/components/dashboard/user/QuedadaManagePanel.tsx` (return final).
- **Estado**: la página `/dashboard/[role]/quedada/[id]` (vista organizador) muestra
  **solo el header** por ahora. Los builders `nav` (switch Gestión/Juego + sub-tabs)
  y `body` (contenido de tabs: Resumen, Pagos, Jugadores, Configurar, Juego,
  Resultados) quedan construidos pero **sin renderizar** (`void nav; void body;`),
  para reconstruir el layout sección por sección.
- **Para quitarlo**: volver a cablear `nav`/`body` en el return (o rehacerlos)
  conforme se defina la nueva estructura de la página.

### Motor rolling de Quedadas — backend listo, UI a medio cablear
- **Archivos**: `src/lib/quedadas/americano.ts` (`pickNextCourtMatch`),
  `src/server/actions/quedadas.ts` (`startAmericanoRolling`, `reportRollingGame`),
  mig 143 (`engine_mode`, `court_match_no`, round nullable).
- **Estado**: Stage 1 (backend) + Stage 2 (UI gestión) hechos: el carrusel del
  header permite cargar el marcador inline (`reportRollingGame`) → auto-asigna el
  siguiente partido en esa cancha; botón "Llenar canchas" (`startAmericanoRolling`).
  Falta: (Stage 3) `QuedadaGameView` aún agrupa por ronda — se rompe en
  `engine_mode='rolling'` (hay que mostrar por cancha/cronológico), y la vista del
  jugador (`QuedadaDetailView`/`getQuedadaPlayerView`) no expone `engine_mode`.
- **Para quitarlo**: completar Stage 3. Ver `docs/product/06-quedadas.md`.

### Centro de ayuda del jugador (`AyudaGuiasScreen`) — contenido mock, sin CMS

`src/components/dashboard/user/AyudaGuiasScreen.tsx` (section `ayuda` del rol
`user`) es el rediseño del centro de ayuda: hero+search, categorías con
drill-down, más leídos, videos y glosario. **No hay CMS de artículos todavía**:

- Lo que SÍ funciona: el search filtra en vivo el contenido visible
  (categorías, artículos populares, glosario), el drill-down de categoría, las
  sugerencias rápidas y "Ir a Soporte" (→ `/dashboard/user/chat`).
- Lo que es placeholder honesto: las hojas (artículo, video, término de
  glosario, destacado) disparan un toast "Centro de artículos · próximamente"
  en vez de abrir contenido. Las categorías sin data (todas menos `torneos`)
  muestran el estado "Estamos escribiendo estas guías" + CTA a soporte.

Cuando exista el CMS: reemplazar `CATEGORY_DATA`/`POPULAR`/`VIDEOS`/`GLOSSARY`
por fetch real y cambiar los `onClick={() => soon(...)}` por navegación al
artículo. Mantener el visual idéntico.

### Editor de personalización (flair) — localStorage + SIN gating MP+ (re-cableo pendiente)

El section `personalizar` del rol `user` ahora renderiza `PersonalizacionFlairView.tsx`
(editor à-la-carte estilo Discord: banner, accent, marco de avatar, aro, card
style, esquinas, friendship card, nameplate, pronombres, tagline, bandera,
featured stats/badge). **Estado actual = demo de UI**:

- Persiste en **localStorage** (`mp-persona-v1`), NO en `profiles`.
- **NO está gateado por MATCHPOINT+** ni resuelto cross-surface (perfil, ranking,
  roster, amigos no leen este flair todavía). La save bar avisa "solo tú los ves
  por ahora".
- Decisión de producto pendiente: este modelo à-la-carte **contradice** el
  sistema curado gateado (`PersonalizacionScreen` + `PersonalizacionScreenClient`
  + `PROFILE_THEMES` + bundles), que quedó **intacto y sin importar** para
  re-cablear el backend.

**Gaps de gobernanza a cerrar al re-cablear** (ver `matchpoint-personalization-governance`):
columnas en `profiles` por cada eje, gating MP+ (`canUsePreset`/`isPlanActive`) +
banner de upsell, render cross-surface, path admin para los ejes pagos, y decidir
si se mantiene "tema cohesivo" o se migra a à-la-carte.

### Soporte del jugador (`SoporteScreen`) — tickets/status demo, canales reales

Section `soporte` del rol `user` (`SoporteScreenView.tsx`). Lo REAL:

- **Datos para soporte**: email, user id y plan vienen de la sesión/perfil.
  "Copiar todo" usa el portapapeles de verdad.
- **Canales**: "Chat en vivo" → `/dashboard/user/chat` (canal de soporte real,
  conversación `kind=support`); "Email" → `mailto:soporte@matchpoint.top`;
  "Llamada" gateada por MP+ (free → `/mi-plan`).

Placeholder honesto (sin backend todavía):

- **Tickets** (form "Abrir un ticket" + lista "Mis tickets"): el form valida y
  muestra toast "Ticket recibido (demo)"; la lista son ejemplos de muestra. No
  hay tabla de tickets — el soporte real es por Mensajes. "WhatsApp" y
  "Adjuntar archivo" → toast "próximamente".
- **Estado del sistema**: ilustrativo (todo "Operativo"); no hay status page
  real ni health-checks. No fabrica incidentes.

Al cablear ticketing real: tabla de tickets + RLS + estados + notif al agente, y
reemplazar los toasts demo por el flujo real. Considerar si se unifica con el
canal de Mensajes `kind=support` en vez de un sistema paralelo.

### Landing de ventas MATCHPOINT+ (`MatchPointPlusScreen`) — facturación DEMO

Section `mp-plus` del rol `user` (sidebar "Mi cuenta"): landing aspiracional de
venta de MP+ (hero, features, comparación Free vs MP+, testimonios, FAQ, CTA).

**⚠️ El modelo de facturación mostrado NO es el real.** El prototipo muestra
prueba 14 días + tarjeta, precios **$9.99/mes** y **$79.99/año**, plan anual,
IVA 12% y auto-renovación. El modelo real (`player-subscriptions.ts`,
`docs/product/00-matchpoint-plus.md`) es: **$5/mes** (`PREMIUM_PRICE_CENTS_PER_MONTH = 500`),
sin PSP/tarjeta, sin trial, transferencia/DeUna, **sin recurrencia automática**,
activación admin. Tampoco hay "sin anuncios" (no hay anuncios) y el IVA EC es 15%.

Los CTA solo muestran toast "próximamente" (NO disparan cobro). Testimonios y
features son de muestra. Decisión de producto pendiente: adaptar precio/copy/FAQ
al modelo real (o definir si se introduce plan anual + trial). La gestión real
del plan vigente sigue en `MiPlanScreen` (`mi-plan`).

### Patrocinadores admin (`AdminPatrocinadoresScreen`) — CRM/inventario DEMO

Section `admin-sponsors` (sidebar admin → "Monetización"). CRM de marcas +
inventario de slots + brand kit con previews de cómo se renderiza cada marca en
cada superficie (quedada, perfil, Coach AI, mapa, shop, comprobante, email,
ranking). **No hay backend de patrocinadores**: marcas, slots, métricas
(spend/impresiones/CTR/ocupación) y placements son **datos de muestra**. Los
botones de mutación (añadir/pausar marca, reemplazar logo, guardar brand kit,
ver métricas/reporte) muestran toast "próximamente"; el drawer y los filtros sí
funcionan (estado local).

Al cablear: tablas `sponsors` + `sponsor_slots` + `sponsor_placements` con RLS
admin, métricas reales, y **render real de los placements** en cada superficie
(cada preview tiene que volverse un componente que lea el placement vendido).
Es además un sistema de monetización nuevo → revisar take rate / facturación.

### Buscar Match (rediseño lobby) — DEMO sobre feature real des-importada

El section `busco-partido` ahora renderiza `BuscarMatchView.tsx` (rediseño tipo
lobby: match destacado, slots vacíos con "+", % de fit, ranked, vistas
cards/lista/mapa, cinta "se acaba de abrir"). **Es mock**: matches, fit, viewing
y "just opened" son datos de muestra; "Unirme"/"Crear match"/"alerta" muestran
toast "próximamente".

⚠️ Reemplaza temporalmente la feature REAL `BuscoPartidoScreen` +
`BuscoPartidoScreenView` (flag `match_seeks_enabled` + actions `match-seeks`:
avisos de búsqueda + aplicaciones), que quedó **preservada y des-importada** de
`[role]/[section]/page.tsx`. Modelos distintos: el real es "avisos + aplicaciones",
el diseño es "matches con cupos/fit". Al re-cablear: decidir si el modelo migra a
"matches con slots" o si el diseño se mapea sobre match-seeks; restaurar el gate
por feature flag.

### Admin Planes premium (rediseño analytics) — DEMO + regresión de la cola

El section `admin-plans` ahora renderiza `AdminMatchPointPlusScreen.tsx`
(rediseño: KPIs financieros MRR/ARPU/churn, planes editables, funnel, features
más usados, tabla de suscriptores, códigos promo + modal). **Es mock.**

🔴 **Regresión operativa conocida (a propósito, decisión del usuario):** reemplaza
la pantalla real `AdminPlansScreen` + `AdminPlansScreenView`, que es la **cola de
aprobación de pagos** de MATCHPOINT+ (`approvePlanSubscriptionAdmin`) y de
featuring de clubes (`approveClubFeaturingAdmin`). Quedó **preservada y
des-importada**. **Mientras esto esté activo, el admin NO puede aprobar pagos MP+
ni featuring desde la UI** — la activación de suscripciones pagas se rompe hasta
re-cablear.

Además el modelo del diseño es ficticio: precios $9.99/mes y $7999/año, trials,
MRR/ARPU/funnel, promo codes — nada de eso existe. El real es $5/mes,
transferencia/DeUna, sin trial/anual/recurrencia/promos.

Al re-cablear: **prioritario** restaurar la cola de aprobación (o mergearla en
esta pantalla); luego decidir si se introducen las métricas/promos reales.

### Admin Membresías de club (rediseño analytics) — DEMO

Section `admin-memberships` ahora renderiza `AdminClubMembresiasScreen.tsx`
(overview agregado: comisión MP, MRR/socios/churn por plataforma, issues a
revisar, ranking de clubes por MRR, plantillas globales). **Es mock**: MRR,
churn, comisión 8% (la take rate real vive en `platform_config`, sin payouts
todavía), issues y plantillas son datos de muestra; botones → toast demo.

Reemplaza la pantalla real `AdminMembershipsScreen` + `AdminMembershipsScreenView`
(`adminListClubMemberships`: lista cross-club **read-only** real), preservada y
des-importada. **Sin regresión operativa** — las membresías las aprueba el staff
del club, no el admin (ver `docs/product/07-club-memberships.md`). Al re-cablear:
sustituir los agregados mock por métricas reales (MRR derivado de
`club_membership_tiers.price_cents` × activos, churn de transiciones de estado) y
restaurar/mergear la lista cross-club real.

### Club Membresías (rediseño) — DEMO + regresión de la cola de aprobación

Section `club-membresias` (owner + manager) ahora renderiza
`ClubMembresiasScreen.tsx` (rediseño: KPIs MRR/churn/ARPU, planes con editor
inline, wizard de crear plan de 3 pasos, tabla de socios con filtros, reglas
globales). **Es mock**: planes, socios y métricas son datos de muestra; crear/
editar/archivar plan, exportar y reglas mutan solo estado local o toast.

🔴 **Regresión operativa (decisión del usuario):** reemplaza la pantalla real
`ClubMembershipsScreen` + `ClubMembershipsView` (CRUD real de tiers +
**cola de aprobación** de pagos de socios: aprobar/rechazar/revocar). Quedó
**preservada y des-importada**. **Mientras esto esté activo, el club NO puede
aprobar pagos de membresía desde la UI** (los socios no se activan). El flujo de
compra del jugador (`requestClubMembership` → `/pagos/[txId]`) sigue creando
pendientes, pero el staff no tiene dónde aprobarlos.

Al re-cablear: **prioritario** restaurar/mergear la cola de aprobación y conectar
los tiers reales (`club_membership_tiers` CRUD vía `saveClubMembershipTier`),
métricas reales de socios. Las "reglas globales" del diseño (pausas, cancelación,
invitados) no tienen backend — definir si se implementan.

### Admin Métricas v2 — ✅ MERGEADO (rediseño + métricas reales)

Section `admin-metrics`: `AdminMetricsScreen` (server) calcula métricas REALES y
las pasa como prop `data` a `AdminMetricasView` (rediseño v2). Se conservó TODO
el diseño y se cableó a datos reales:

- **KPIs por periodo**: usuarios activos (organizadores de reservas no
  canceladas en la ventana), DAU (activos 24 h), GMV (`transactions` captured) y
  take rate (`platform_config`). Cada KPI trae **delta vs el periodo anterior**.
- **Selector de periodo (24h/7d/30d/90d/YTD)**: el server precalcula cada
  periodo (KPIs + serie GMV actual + serie del periodo anterior); el cliente
  re-indexa sin refetch. **No es mock** — re-agrega datos reales.
- **Toggle Comparar**: superpone la serie GMV del **periodo anterior real**
  (24h→24h previas, 30d→30d previos, YTD→mismo tramo del año pasado) y muestra
  los pills de delta en los KPIs.
- **GMV line**: serie real por bucket (hora/día/mes según periodo) + overlay del
  periodo anterior.
- **Funnel de adquisición**: signup (`profiles`) → onboarding (`onboarded_at`) →
  primer match (≥1 reserva) → match #5 (≥5 reservas) → MP+ (`plan_tier=premium`).
  Reales sobre toda la base.
- **Heatmap día×hora**: reservas no canceladas de los últimos 90 días por
  día-de-semana × hora; el insight señala el **pico real** (no hardcodeado).
- **Cohortes de retención**: cohortes por mes de signup × % de la cohorte con
  actividad (reserva) en la semana N (W0/W1/W2/W4/W8/W12). Semanas en el futuro
  para cohortes nuevas se muestran "—". **Cálculo real** desde `profiles` +
  `reservations`.
- **Breakdowns**: top deportes (reservas 30d), top ciudades por usuarios
  (`profiles.city`), top clubes por GMV (`transactions.club_id` → `clubs.name`).
- **Exportar**: baja un **CSV real** de la vista del periodo activo (KPIs,
  funnel, breakdowns, serie GMV). Reemplaza el toast "(demo)".
- **Refresh en vivo**: realtime de `transactions`/`reservations`/`profiles` con
  debounce 5 s → `router.refresh`.

Tipos compartidos en `AdminMetricsScreenView.tsx` (reexporta el componente del
rediseño). **Sin regresión** (analytics read-only). Métricas que NO se aproximan
con datos reales no se fabrican (se muestran "—"/"Sin datos").

**Pendiente (necesita backend nuevo, NO aplicado):** no hay tabla de **eventos de
producto** (page views / sesiones), así que: MAU/DAU usan *organizadores de
reservas* como proxy de actividad (no logins reales) y el primer escalón del
funnel es "Signup" (no "Visitas web/app"). Para MAU/DAU/visitas reales se
requiere instrumentar eventos (tabla `analytics_events` o similar) — coordinar
como migración aparte.

### Admin Audit log v2 — ✅ MERGEADO (rediseño + audit_log real)

Section `admin-audit`: `AdminAuditScreen` (server) lee `audit_log` REAL (últimos
200, resuelve actores en `profiles`) → `AdminAuditView` (rediseño v2). Se conservó
todo el diseño y se cableó a datos reales: KPIs (24h/críticos/actores/acciones),
búsqueda + filtros chips, pills por categoría, segmented de severidad, stream
agrupado por día, drawer con metadata/diff/raw JSON, **export CSV/JSON real** de la
vista filtrada, y **refresh en vivo** (router.refresh cada 15s con live tail).
**Severidad y categoría se DERIVAN de entity+action** (no son columnas); actor,
ip, ua, diff y timestamp son reales. `geo` no se almacena → "—". El gráfico del
hero es un **histograma real** de eventos/hora (24h). `AdminAuditScreenView` queda
como respaldo. **Sin regresión.**

**Hash chain real (mig 154):** `audit_log` ahora tiene `prev_hash`/`row_hash`;
`tg_audit_chain` (BEFORE INSERT, advisory lock) encadena
`row_hash = sha256(prev_hash || contenido)`. La card "Integridad · hash chain"
verifica de verdad vía `fn_verify_audit_chain()` (solo admin) → `verifyAuditChain`
action. Tamper-evident: alterar/borrar una fila vieja rompe la cadena y se detecta.
Ver docs/security/03-audit-log.md.

### Admin Permisos & Roles v2 — ✅ MERGEADO (rediseño + backend real)

Section `admin-roles`: `AdminRolesScreen` (server) lee datos reales
(counts/miembros por rol, **solicitudes pendientes**, clubes) → `AdminRolesView`
(rediseño). Se conservó el visor (lista de roles por scope, hero, matriz de
capacidades por dominio, comparador, leyenda) y se **recableó lo operativo**:
- **Solicitudes de rol pendientes** (real) con Aprobar (`approveRoleRequest`, pide
  club si el rol lo requiere) / Rechazar (`rejectRoleRequest`).
- **Asignar rol** (modal con `searchUsers` + rol + club) → `assignRole`.
- **Miembros reales** por rol con Revocar (`revokeRole`).
- Counts y avatares reales; realtime de `role_assignments`/`role_requests` + `router.refresh`.

Solo se muestran los **7 RoleKey reales** (se quitaron mod/support/finance del
prototipo, que no existen). La **matriz de capacidades es referencia ilustrativa**
(el RBAC granular no existe; el control real es por RoleKey), marcada como tal en
la UI. `AdminRolesScreenView` queda como fuente de tipos + respaldo. **Sin regresión.**

### Admin Feature flags v2 — ✅ MERGEADO COMPLETO (rediseño + backend real)

Section `admin-flags`: `AdminFlagsScreen` (server) → `AdminFlagsView` (rediseño v2
cableado a datos/acciones REALES). **Se conservó TODO el diseño y se cableó** (no
se recortó nada):

- Toggle on/off, rollout % → `upsertFlag` (audit).
- Crear/borrar flag → `upsertFlag`/`deleteFlag`.
- Excepciones por usuario/club/rol → `upsertFlagAssignment`/`deleteFlagAssignment`
  + `searchUsers`.
- **env** (prod/staging/beta/dev), **impact** (low/med/**high=crítico**),
  **owner**, **segment**: columnas reales (mig **152**), editables en el drawer.
- **Kill switch** real → `killSwitchNonCritical` (apaga no-críticos en prod, audit).
- **Historial** real desde `audit_log` (entity=feature_flags) → `listFlagHistory`.
- Filtro por env + estado, KPIs (incl. críticos), realtime.

- **Registro de flags** (`src/lib/flags/registry.ts`): fuente de verdad de los
  flags que el código conoce, con `description`, `surfaces`, `impact` y **`wired`**
  (true = el código ya lo lee; false = registrado/planeado, pendiente de cablear).
  El panel lo usa para: (a) "Nuevo flag" elige de la lista de conocidos no creados
  (+ modo manual avanzado); (b) cada flag muestra "qué controla" con badge
  **Cableado/Pendiente**; (c) marca ⚠️ "sin uso" los huérfanos (en DB, fuera del
  registro). **Cableados hoy**: `match_seeks_enabled`, `match_reliability_enabled`,
  `maintenance_banner` (mig 156: lo lee `dashboard/[role]/layout.tsx` → muestra un
  banner global en `DashboardChrome` cuando `enabled_default` está on; el texto del
  aviso es la `description` del flag; se puede cerrar por sesión).
  **Cableados** (mig 156/157): `coach_ai_enabled`, `quedadas_enabled`,
  `club_memberships_v2` gatean sidebar + pantalla (layout
  pasa `getMyEffectiveFlags` → `DashboardSidebar` oculta items con flag off;
  `page.tsx` muestra `FeatureOffScreen` si la sección tiene flag off). `signups_open`
  se chequea en la action `signUp` (lectura global con `getAdminClient`, RLS bloquea
  anónimos). `maintenance_banner` → banner global en `DashboardChrome` con severidad
  por `impact`. Semántica de gate: flag ausente o on = visible; solo oculta si existe
  y está explícitamente off (no rompe features sin flag).
- **Rename de features** (mig **153**, columna `feature_flags.label`): el nombre
  visible es editable desde el drawer ("Nombre visible"), sin tocar la `key`.
  Precedencia del nombre: `label` (admin) → registro → `titleize(key)`.

`AdminFlagsScreenView` queda como fuente de tipos (`FlagRow` extendido) + respaldo.
**Sin regresión.**

### Admin Configuración v2 (rediseño) — editor DEMO (no persiste)

Section `admin-config` ahora renderiza `AdminConfigView.tsx` (settings agrupados
por dominio con sidebar, editor inline por fila con audit, save bar sticky,
búsqueda global, grid de integraciones). **Es demo**: no hay tabla
`platform_settings`; el draft es local y el save bar **descarta al guardar** (no
persiste).

Reemplaza la pantalla real `AdminConfigScreen` + `AdminConfigScreenView`
(constantes del app + counts reales, read-only), **preservada y des-importada**.
**Sin regresión operativa** (la vieja tampoco mutaba — "Guardar config" no tenía
handler). Suavicé claims falsos del prototipo: marca **MATCHPOINT**, dominio
`matchpoint.top`, "procesador Stripe Connect" → **Transferencia/DeUna** (no hay
PSP), payouts/refunds → manual, IVA 15%, precio MP+ $5/mes, y reduje las
integraciones a las plausibles (mapas/email reales; push/SMS pendientes). El
único config real hoy es `platform_config.take_rate_pct`.

Al re-cablear: crear `platform_settings` (o ampliar `platform_config`) + action
con `setAuditActor`, y conectar solo los settings que tengan efecto real.

### Admin Flair de usuarios (rediseño v2 del kit) — DEMO (regresión consciente del wiring previo)

Section `admin-cosmetics`: `AdminCosmeticsFlairScreen` (server thin passthrough) →
`AdminFlairUsuariosView` (client). El view ahora es el **rediseño nuevo 1:1**
del kit (`ui_kits/dashboard/AdminFlairUsuariosScreen.jsx`): tabs **Usuarios /
Reportes / Analytics / Templates oficiales / Moderación de watermarks** con
data 100% demo inline y todos los actions en toast "Próximamente".

**Regresión consciente respecto a la versión previa:** el wiring real de
cosmetic_bundles (otorgar/revocar bundles, editar precio, activar/desactivar
temas, búsqueda de usuario) **dejó de tener UI** en esta pantalla. Las server
actions siguen existiendo en `src/server/actions/admin/cosmetics.ts`:
- `grantBundleToUser` / `revokeBundleFromUser` / `listGrantsForUser`
- `searchUsersForCosmetics`
- `setBundlePrice` / `setBundleActive`
- `setThemeActive` / `setAllThemesActive`

Y el componente original sigue en `AdminCosmeticsScreen.tsx` (sin route
asignada). Stage 2 = re-wire del nuevo diseño contra esas actions cuando exista
el modelo per-user de "flair attributes" (template + banner + accent +
watermark) y `flair_reports` / `blocked_watermarks`. Mientras tanto, para
otorgar bundles manualmente: server action directa o reactivar
`AdminCosmeticsScreen` en una ruta auxiliar.

🟡 **Pendiente de backend para que la pantalla nueva sea real:**
- **Per-user flair attributes**: nuevo modelo en `profiles` o tabla separada
  `profile_flair` (template + banner + accent + watermark + edited_at). Hoy
  `profiles.accent_color` es lo único que existe.
- **Tab Reportes**: `flair_reports (id, reported_user_id, reporter_user_id,
  field, value, reason, status, created_at, resolved_at, resolved_by)` + RLS
  + actions `reportFlair` / `resolveFlairReport`.
- **Tab Moderación de watermarks**: `blocked_watermarks (word)` simple +
  actions `addBlockedWatermark` / `removeBlockedWatermark`. Solo aplicable
  cuando exista watermark editable por el usuario (hoy no — los temas son
  curados).
- **Tab Templates oficiales**: ya existe el catálogo en `PROFILE_THEMES` +
  `AdminThemeDesignerView`. El botón "Crear template" del nuevo diseño debe
  navegar a `admin-theme-designer` (en Stage 2). Por ahora abre el modal con
  el form y dispara toast al crear.

### Admin Theme Designer (`admin-theme-designer`) — DEMO

Section `admin-theme-designer` (sin item de sidebar; se llega desde el botón
**"Theme designer"** de `admin-cosmetics`/Flair de usuarios). `AdminThemeDesignerView.tsx`:
lista de templates (oficiales/borradores/archivados) + editor con secciones
colapsables (banner+overlay con gradient editor custom, color, avatar, cards,
nombre, friendship, **cancha visual** con superficie/líneas/estilo/grosor) +
preview en vivo + save bar. **Es demo**: estado local, no persiste; los
"templates oficiales" no existen en backend.

El **preview reusa los componentes reales** de Personalización
(`ProfilePreviewCard`/`FriendshipPreviewCard`/`MatchRowPreview`, ahora exportados
desde `PersonalizacionFlairView`), así que es fiel al render del usuario. El SVG
de cancha es el de pickleball completo (viewBox 903×419) parametrizado.

Al re-cablear: modelar templates oficiales (tabla + publish/draft) e integrarlos
con el catálogo de personalización (`PROFILE_THEMES`) — hoy son dos mundos
(temas curados gateados vs editor à-la-carte localStorage).

### Club/Owner Canchas v2 (rediseño) — DEMO + regresión temporal

Section `club-canchas` (roles club y owner) ahora renderiza `ClubCanchasView.tsx`:
3 tabs (Galería con SVG real de pickleball + estado en vivo / Agenda timeline /
Plano del club) + drawer de detalle. **Es mock**: live "en juego", revenue y
reservas de hoy, agenda y floorplan son ilustrativos.

🔴 **Regresión temporal (el usuario pidió "todo el diseño, backend después"):**
reemplaza la real `ClubCanchasScreen` + `ClubCanchasScreenView` (canchas reales de
`courts` + `court_pricing` + utilización por `reservations`, con
`createCourt`/`updateCourt`), **preservada y des-importada**. Mientras esté activo
no se pueden crear/activar/bloquear canchas reales desde la UI.

Al re-cablear (merge): galería con `courts` reales + acciones
`createCourt`/`updateCourt`/`archiveCourt`; live/revenue/agenda desde
`reservations` de hoy + `court_pricing`; floorplan por `ordinal`; y para
"mantenimiento" como estado propio (hoy solo hay `active`) hace falta una columna
nueva en `courts` (ej. `maintenance_until`/`status`).

### Club/Owner Finanzas v2 (rediseño) — DEMO (read-only, sin regresión)

Section `club-finanzas` ahora renderiza `ClubFinanzasView.tsx`: PolHero + payout
neto con waterfall + KPIs 2×2 + revenue 30 días stacked + revenue por fuente +
ranking por cancha + heatmap $/h + transacciones + calendario de payouts. **Es
mock.** Reemplaza la real `ClubFinanzasScreen` + `ClubFinanzasScreenView` (KPIs
reales: revenue, breakdown por kind, barras 30 días, empleados), **preservada y
des-importada**. Era read-only → **sin regresión operativa**; solo muestra mock en
vez de datos reales.

Ajustes de honestidad: métodos de pago al modelo real (Transferencia/DeUna/Saldo
MP/Efectivo — **sin tarjeta/Apple Pay**, no hay PSP) y marca **MATCHPOINT**.

Al re-cablear (merge): alimentar KPIs/30-días/breakdown desde la query real que ya
tiene `ClubFinanzasScreen`; transacciones desde `payment_proofs`/`reservations`;
payouts y waterfall requieren modelar payouts (hoy no existen — refunds y comisión
sí, ver docs/product/02-payments.md). Heatmap $/h desde `reservations` por hora.

### Club/Owner Configuración v2 (rediseño) — DEMO

Section `club-config` ahora renderiza `ClubConfigView.tsx`: 7 secciones (Identidad
con preview público live · Horarios grid semanal + feriados · Tarifas matriz
cancha×franja + membresías · Pagos & payouts con banco/comisión/métodos ·
Cancelación timeline de refund · Notificaciones matriz canal×evento · Reglas).
**Es mock** (inputs uncontrolled, toggles visuales). Reemplaza la real
`owner/ClubConfigScreen`, **preservada y des-importada**.

Ajustes de honestidad: métodos de pago al modelo real (**Transferencia/DeUna/
Saldo MP/Efectivo**, tarjeta como "próximo" — no hay PSP), marca **MATCHPOINT**,
dominio **matchpoint.top**.

Al re-cablear (merge): Identidad → `clubs` (nombre, logo, portada, redes,
ubicación) con upload real; Horarios/Tarifas → `court_pricing` + tabla de
horarios; Pagos → cuenta receptora del club + take rate de `platform_config`;
Notificaciones → `notification_preferences` por club; Reglas → tabla nueva. Surge,
salud del perfil y sensor de lluvia son conceptos del diseño sin modelo aún.

### Club/Owner Personal v2 (rediseño) — DEMO

Section `club-staff` (roles club y owner) ahora renderiza `ClubStaffView.tsx`:
PolHero + KPIs (headcount/nómina/horas/coaches) + **timeline de turnos en vivo**
(05:00–22:00 con línea "ahora") + filtro por departamento + búsqueda + cards de
staff (identidad, semana, sueldo, performance, acciones) + distribución por
departamento + desglose de nómina. **Es mock.** Reemplaza la real
`ClubStaffScreen` + `ClubStaffScreenView` (staff del club vía `role_assignments`),
**preservada y des-importada**.

Al re-cablear (merge): staff desde `role_assignments` del club (manager/coach/
employee) + perfiles; turnos y nómina **no existen en el modelo** (requieren
tablas nuevas: turnos/horarios y nómina/sueldos); performance desde métricas
reales (check-ins, ratings de clases). El descuento de nómina del payout depende
de modelar payouts (ver finanzas).

### Empleado Pro shop & bar v2 (rediseño) — DEMO

Section `e-shop` ahora renderiza `EmployeeProShopView.tsx`: PolHero + 4 tabs —
**POS** (chips de categoría + grid de productos + **carrito interactivo real** con
subtotal/IVA/total y método de pago) · **Inventario** (stats, bajo stock, tabla) ·
**Catálogo** (form de alta + grid) · **Movimientos** (ventas del día, best sellers,
estado de caja). **Es mock**: catálogo/stock/ventas no persisten; el carrito es
estado local y "Cobrar" solo muestra toast. Reemplaza la real `EmployeeShopScreen`
+ `EmployeeShopScreenView`, **preservada y des-importada**.

Ajuste de honestidad: métodos de pago al modelo real (**Efectivo/Transferencia/
DeUna/Saldo MP** — sin tarjeta/Apple Pay, no hay PSP); KPI "Tarjeta" → "Digital".

Al re-cablear (merge): catálogo/stock desde una tabla de productos del club +
acciones CRUD; ventas → registrar transacción + descontar stock + sumar a caja;
caja/cierre Z desde sesiones de caja. Hoy no existe modelo de pro shop/inventario.

### Admin Comunicaciones v2 — ✅ MERGEADO (mayormente real)

Section `admin-broadcast`: `AdminBroadcastScreenServer` (server) carga campañas
REALES (`listBroadcasts` scope=platform + conteo de `broadcast_recipients`) →
`AdminBroadcastView`. **Real ahora**:
- **Lista de campañas** (broadcasts reales) con tabs (Todas/Enviadas/Programadas/Borradores) + KPIs reales (enviadas/destinatarios/programadas/borradores).
- **Envío** push/email/in-app: "Enviar ahora" → `createBroadcast` + `dispatchBroadcast` (fan-out vía `notify()`); "Programar" → `createBroadcast` con `scheduledFor`; "Guardar borrador" → draft.
- **Audiencia real**: chips → `target_filter` (ciudad/deporte/plan MP+/owner, columnas reales); `countAudience` da el **alcance real**; `dispatchBroadcast` aplica el filtro (antes ignoraba `target_filter`).
- **Canal Banner** → anuncio global real (`announcements`, mig 162) vía `setAnnouncementBanner`/`clearAnnouncementBanner`; lo ve todo el dashboard (unifica `maintenance_banner`).
- **Plantillas** (mig 163, `broadcast_templates`): "Guardar plantilla" persiste el composer; las cards cargan la plantilla (canal/título/cuerpo/CTA/segmentos) y se borran. Real.

- **Tracking de aperturas** (mig 164, `broadcast_recipients.opened_at`): se marca
  cuando el usuario abre (lee) la notificación del broadcast (en `markNotificationRead`).
  → **open-rate real** en la lista de campañas + funnel (Enviados→Entregados→Abiertos).

**Pendiente real (no fakeado — requieren más que cablear):**
- **Clicks / conversión**: no hay señal de click separada de la apertura en el
  flujo de notificaciones → el funnel muestra solo hasta Abiertos (no inventa click).
- ⚠️ **Cron de programadas**: las `scheduled` no se auto-envían (necesita pg_cron +
  dispatcher SQL, o edge function, que duplica `notify()` — infra, se difiere).
- **Best-time send**: necesita histórico de aperturas (recién empezamos a recolectar).
- **A/B test** y **"Generar con IA"**: features nuevas (variantes+tracking / integración
  Anthropic) — fuera de "cablear". `AdminBroadcastScreen`/`...View` reales preservadas.

### `RoleScreenStub` — secciones del sidebar sin pantalla real

- **Archivo**: `src/components/dashboard/RoleScreenStub.tsx`
- **Cuándo aparece**: cada `(role, section)` que **no está** en el `SCREENS`
  map de `src/app/dashboard/[role]/[section]/page.tsx`.
- **Copy**: *"Pantalla específica del rol [ROLE]. Por ahora ves solo el
  Home con fidelidad completa; cada sección del sidebar tendrá su propia
  vista en la próxima iteración."*
- **Cobertura actual** (qué cae a stub):

| Rol | Items sin pantalla real |
|---|---|
| `employee` | `e-soporte` (no implementado) — 2 items totales sin pantalla |
| `coach` | 1 item sin pantalla |
| `manager` | 1 item sin pantalla |
| `partner` | 1 item sin pantalla |
| `owner` | 1 item sin pantalla |
| `user` | algunas secundarias (`team`, `solicitar-club` están reales) |
| `admin` | 100% cubierto |

### `PLACEHOLDER_COUNT` en pantallas admin

Cuando una pantalla aún no tiene datos reales, renderiza filas vacías
opacas con la palabra "Sin datos aún" — patrón consistente. Ver:

- `AdminAuditScreenView.tsx:11` — `PLACEHOLDER_COUNT = 6`
- `AdminBroadcastScreenView.tsx:52-53` — sent=3, draft=2
- `AdminEventsScreenView.tsx:50` — count=4
- `AdminPagosScreenView.tsx:67` — count=4

**Importante**: cuando data real llega, el componente reemplaza placeholders
sin re-render del layout (consistent UX). Si vas a refactorear: respetar el
patrón opacity 0.5 + dashed border que ya está estandarizado.

### `BADGES` en UserHome
- **Archivo**: `src/components/dashboard/user/UserHomeView.tsx:1006`
- **Estado**: array hardcoded de 5 badges (`1° match, Racha 5, Top 50,
  Doblete, Campeón`) con flag `on` literal.
- **Counter dinámico** (sí, fixed): muestra `unlocked / total` desde el
  array (`MyBadgesSection` calcula con filter).
- **Para hacerlo real**: tabla `badges` (catálogo) + `player_badges` (qué
  desbloqueó cada user) + query desde server. Hoy todo es ilustrativo.

---

## 3. 🟢 Stubs internos / Features pending

### `payouts` table existe pero no se crea automáticamente
- **Tabla**: `public.payouts` (mig 081)
- **Estado**: schema + RLS listos. UI lee rows en `AdminPagosScreen`. Pero
  **nadie crea rows** — se insertan a mano via SQL al cerrar período.
- **Para activar**: cron mensual que lea `transactions captured` por
  partner/club y reste `take_rate_pct` del config.

### Cron `cleanup-expired-plans` corre pero no notifica al user
- **Mig**: 049
- **Estado**: pasa subs vencidas a `expired` + downgrade del profile. **No
  envía notif al user** ("Tu MATCHPOINT+ venció").
- **Para activar**: agregar `notification_jobs` insert en el SQL del cron
  para cada user que se downgradeó.

### `feature_flags` table existe pero no se usa
- **Tabla**: `feature_flags` (algún mig viejo)
- **Estado**: schema + tabla. UI admin (`AdminFlagsScreen`) puede listarlas
  pero ninguna feature actual chequea flags realmente.
- **Para activar**: helper `requireFeatureFlag(key)` en server actions +
  client-side gating con tooltip "feature disabled" en botones.

### Match results / bracket progression
- **Estado**: `generateBracket` crea estructura random + `bracket_matches`
  rows. **No hay UI** para reportar resultados, ni lógica que avance
  ganadores a la siguiente ronda.
- **Para activar**: action `reportMatchResult` (validar score válido +
  rellenar `winner_side` + crear next-round match si aplica) + UI en
  `/dashboard/partner/p-brackets`.

### Email channel del dispatcher
- **Estado**: módulo `src/lib/notifications/email-templates.ts` existe,
  cron `dispatch-email` existe, pero ningún kind tiene `'email'` en
  `default_channels`. Todo es `inapp`.
- **Para activar**: agregar `'email'` al kind + handler en email-templates
  para ese kind + setup SMTP / Resend / SES.

### Push notifications
- **Estado**: cero implementación. PWA tampoco está instalable.
- **Para activar**: agregar manifest + service worker + opt-in modal +
  almacenar tokens en `user_push_tokens` (tabla por crear).

### Teams · admin governance ausente (gap retroactivo del Stage 1-3)
- **Estado**: feature teams completo backend + UI player, pero NO hay
  pantalla admin para listar todos los teams, ver caps por team, forzar
  override de caps, banear/disolver desde admin, ni audit log filtrado
  por team. Soporte hoy tendría que abrir Supabase Studio para
  investigar un team problemático.
- **Detección**: la skill `matchpoint-feature-plan` (actualizada en
  esta misma sesión) lo flagearía como antipatrón. Se nos pasó porque
  el plan original no incluía §1.9 Admin governance.
- **Para activar** (cuando se decida priorizar):
  1. Nueva pantalla `AdminTeamsScreen` en
     `src/components/dashboard/admin/AdminTeamsScreen.tsx`.
  2. Sidebar item `admin-teams` en `MP_ROLES.admin.sidebar`.
  3. Capacidades: listar all teams (con filtros sport/captain/clubId),
     drilldown a roster, override `rename_count`, disolver con motivo
     (audit log), ver historial de invites.
  4. Reflejar permiso en `AdminRolesScreen` (catálogo operativo de
     permisos admin).

### Welcome DM templates hardcoded en `src/lib/messages/system.ts`
- **Archivo**: `src/lib/messages/system.ts` (constante `WELCOME_TEMPLATES`).
- **Estado**: 4 templates de bienvenida (signup, team_created, premium_activated, onboarding_completed) viven en código TS, no en DB.
- **Para activar**:
  1. Crear key `platform_config.system_message_templates` con JSON de
     templates por kind.
  2. `renderTemplate` lee de `platform_config` en runtime (vía RPC
     `fn_get_system_message_templates` SECURITY DEFINER).
  3. Admin UI en `AdminBroadcastScreen` o nueva `AdminTemplatesScreen`
     para editar.
- **Por qué importa**: hoy editar el copy del welcome requiere PR + deploy.
  Marketing/producto debería poder iterar copy sin pasar por dev.

### Admin "broadcast as MATCHPOINT" ausente
- **Estado**: el perfil oficial MATCHPOINT existe (mig 104) y manda
  welcome DMs automáticos. Pero admin NO puede usar MATCHPOINT para
  mandar broadcasts manuales (anuncio plataforma, alerta, etc).
  `AdminBroadcastScreen` actualmente manda como el propio admin user.
- **Para activar**:
  1. Toggle en AdminBroadcastScreen: "Enviar como MATCHPOINT Oficial"
     (solo visible para admin).
  2. Server action `sendBroadcastAsSystem(recipientIds, body)` que
     internamente usa `fn_send_system_message` por cada recipient.

### Teams · feature flag ausente (gap retroactivo)
- **Estado**: los caps de teams (12/24, 3/∞, 2/5) están "encendidos"
  para todos los users en producción. No hay killswitch — si los caps
  generan fricción inesperada (ej. teams legítimos con >12 miembros
  pre-existentes), no se puede pausar sin redeploy.
- **Mitigación parcial**: `platform_config.team_caps` permite ajustar
  los números sin redeploy (subir el cap free a 50 = killswitch suave).
- **Para activar killswitch real**:
  1. Seed `feature_flags.teams_caps_enforced` con `enabled_default: true`.
  2. `getTeamCaps` lee el flag — si está off, devolver caps "infinitos"
     (Number.MAX_SAFE_INTEGER) para todos.
  3. UI deja de mostrar badges/banners cuando flag off.

---

## 4. UI con datos ilustrativos (estilo demo)

Pantallas que actualmente muestran datos plausibles pero **fake/seed para
demo**, no productivos:

- `AdminBroadcastScreenView` — mensajes de ejemplo
- `AdminAuditScreenView` — algunas filas seed para demo (si la tabla está
  vacía en dev)
- `RatingSparkline` en UserHome cuando un user nuevo no tiene history —
  muestra una línea plana en `STARTING_RATING_VIEW = 2500`

Cuando los reemplaces con data real, mantener el visual idéntico para no
romper el lenguaje del dashboard.

---

## 5. Botones sin handler funcional (audit)

Del audit per-role:

| Botón | Archivo | Estado |
|---|---|---|
| "Nueva campaña" | `AdminBroadcastScreenView:241` | sin onClick |
| "+ Agregar filtro" | `AdminClubsScreenView:479` | sin onClick |
| "Guardar config" | `AdminConfigScreenView:95` | sin onClick |
| "+ Crear evento" (admin) | `AdminEventsScreenView:205` | sin onClick |
| "Reportar abuso" | `AdminModScreenView:164` | sin onClick |

Hay 7+ más en owner/coach/employee. Cuando los implementes, agregar al
server action correspondiente + wire onClick + toast de resultado.

---

## 6. Reglas

1. **Si vas a agregar UI**, primero buscá si hay stub existente — no metas
   un componente paralelo, reemplazá el stub.
2. **Marcá explícitamente** todo lo que sea WIP. Usá `// TODO:` o un copy
   visible al user ("próximamente", "en desarrollo").
3. **No mentir al user**. Mejor "—" o "Sin datos" que un número fake.
4. **Cuando convertís un placeholder en real**, sacarlo de este doc.

## 7. TODOs grandes

- [ ] Eliminar `BADGES` literal de UserHome → tabla real
- [ ] Cron que crea `payouts` automáticamente
- [ ] Cron `cleanup-expired-plans` enviando notif
- [ ] Helper `requireFeatureFlag()` + uso en features no-listas
- [ ] Match result reporting + bracket progression
- [ ] Email channel real
- [ ] Cubrir items sin pantalla de employee/coach/manager
- [x] ~~Customización de perfil — `card_style` no renderiza en listados~~.
  ✅ Resuelto en Stage 4 (mig 115 abrió SELECT a `profile_cosmetic_grants`,
  AmigosScreen + TeamScreen resuelven ownership por user, FriendCard +
  roster filas aplican `cardStyleCss` y `accentHex`). Falta `/players/[username]`
  card aparte si quieres tematizar más allá del header — el header ya
  consume `ProfileHeaderCard` con todo.
- [ ] **Busco partido (match seeks)** — items diferidos de v1:
  - Sidebar item `busco-partido` es visible con el flag `match_seeks_enabled`
    en `false` → lleva a `BuscoPartidoComingSoon` ("Pronto") para todos.
    Placeholder deliberado pre-launch; al activar el flag se vuelve la
    pantalla real. Alternativa futura: filtrar el item del sidebar por flag
    efectivo (requiere plumbing de flags en `DashboardChrome`).
  - Chat `kind='match'` usa título genérico "Partido", sin avatar/icono
    distintivo en `MensajesScreenView`. Funciona, falta polish visual.
  - Filtro "mi club" en el feed pendiente — el perfil no tiene `home_club_id`.
  - Caso dobles "completar mi equipo con randoms" fuera de v1.
  - Sin pantalla admin dedicada para moderar avisos (solo audit log).
  - `Database` types no incluyen `match_seeks*` (casts `LooseClient`, igual
    que `matches.ts`). Regenerar types es mantenimiento aparte.
- [ ] **No-show + fiabilidad — UI restante** (flag `match_reliability_enabled`
  OFF; ver `product/04-matches-lifecycle.md`):
  - ✅ Botón "¿No apareció?" en el `MatchActionBar` del chat (gated por flag +
    matchTimePassed + por participante → `reportNoShow`).
  - Pendiente: badge de fiabilidad (`reliabilityTier`) en perfil /
    `AdminUsersScreen`.
  - Pendiente: incrementar `player_reliability.cancellations` en `cancelMatch`
    (hoy solo no-show mueve el score).
- [ ] **Multideporte — cola de refactor** (ver `product/05-multisport.md`):
  - ✅ Hecho: busco-partido, onboarding, CrearMatch, **landing /ranking**
    (`RankingPageView`), **toggle admin** en `AdminConfigScreen` (sección
    "Deportes"). El ranking del dashboard ya es pickleball-fijo.
  - Pendiente (filtros de deporte en superficies secundarias):
    `ClubesPageView`, `EventosPageView`, `CoachesPageView`,
    `SolicitarClubScreenView`. `CrearJuegoModal` y `CreateTournamentFlow`
    están pickleball-locked por diseño (correctos con flag OFF; cuando se
    quiera multisport ON en torneos hay que abrir esos flujos).
- [ ] **Cosmetics: self-service purchase flow** (Stage 4 de customización).
  Hoy fase 1 es admin grant manual tras pago manual. Falta UI en
  `/dashboard/user/personalizar` para que el user clickee "Comprar pack
  X", suba comprobante, y admin apruebe en `/dashboard/admin/admin-cosmetics`
  (mismo panel hoy ya hace grant, faltaría estado `pending` en
  `profile_cosmetic_grants` + integrar con flow de comprobantes existentes
  de MP+).
