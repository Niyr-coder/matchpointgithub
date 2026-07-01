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

### Motor de juego de Quedadas — ✅ MERGEADO (registry por formato)
- **Estado**: `QuedadaManagePanel`, `QuedadaDetailView` y `QuedadaGameView` ya
  montan juego para `americano`, `mexicano`, `round_robin`, `kotc`, `canguil` y
  `libre`. La generación usa `generateQuedadaRound` + registry de engines; Libre
  crea partidos manuales.
- **Residual**: los algoritmos sociales son MVP; cuando se quiera optimizar
  rotaciones perfectas o KOTC avanzado, hacerlo sobre
  `src/lib/quedadas/engines/`.

### Página de gestión de Quedadas — solo header (reestructuración paso a paso)
- **Archivo**: `src/components/dashboard/user/QuedadaManagePanel.tsx` (return final).
- **Estado**: la página `/dashboard/[role]/quedada/[id]` (vista organizador) muestra
  **solo el header** por ahora. Los builders `nav` (switch Gestión/Juego + sub-tabs)
  y `body` (contenido de tabs: Resumen, Pagos, Jugadores, Configurar, Juego,
  Resultados) quedan construidos pero **sin renderizar** (`void nav; void body;`),
  para reconstruir el layout sección por sección.
- **Para quitarlo**: volver a cablear `nav`/`body` en el return (o rehacerlos)
  conforme se defina la nueva estructura de la página.

### Motor rolling de Quedadas — pausado
- **Archivos**: `src/lib/quedadas/americano.ts` (`pickNextCourtMatch`),
  `src/server/actions/quedadas.ts` (`startAmericanoRolling`, `reportRollingGame`),
  mig 143 (`engine_mode`, `court_match_no`, round nullable).
- **Estado**: el helper de emparejamiento y parte de la UI existen, pero la
  activación está bloqueada en servidor/UI para evitar una experiencia incompleta.
  El modo por rondas es la ruta activa para los motores automáticos.
- **Para quitarlo**: completar vista por cancha/cronológica para organizador y
  jugador, reactivar `startAmericanoRolling` y volver a permitir `engine_mode='rolling'`.

### Centro de ayuda del jugador (`AyudaGuiasScreen`) — ✅ MERGEADO (Help CMS)

`src/components/dashboard/user/AyudaGuiasScreen.tsx` ahora carga datos reales
del Help CMS (`help_articles` publicados). El rediseño conserva hero+search,
categorías con drill-down, más leídos, videos, glosario, visor de artículo con
TOC y feedback. Si no hay contenido publicado, muestra estados vacíos honestos.

### Admin Ayuda y guías (`AdminAyudaGuiasScreen`) — ✅ MERGEADO (CMS mínimo)

Section `admin-ayuda-guias` gestiona `help_articles`: crear borrador, editar,
publicar y archivar. También muestra métricas reales de vistas, feedback y
búsquedas sin resultado desde `help_feedback`/`help_search_logs`.

### Personalización de perfil — retirada

El sistema anterior fue desconectado completo: ya no hay sections de usuario,
pantallas admin, actions, helpers ni tablas vivas para personalización de
perfil. El nuevo diseño queda pendiente y debe crear sus propios contratos.

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

### MATCHPOINT+ user (`MiPlanScreen`) — ruta real

La ruta oficial del rol `user` para plan premium es `mi-plan`
(`/dashboard/user/mi-plan`). El sidebar apunta ahí tanto para usuarios Free como
Premium, y el alias legacy `mp-plus` sigue resolviendo a `MiPlanScreen` para no
romper links existentes.

`MatchPointPlusScreen` queda como componente legacy descolgado: su prototipo de
facturación no coincide con el modelo real (`player-subscriptions.ts`,
`docs/product/00-matchpoint-plus.md`), que usa transferencia/DeUna, comprobante
manual y activación admin.

### Patrocinadores admin (`AdminPatrocinadoresScreen`) — backend Fase 1

Section `admin-sponsors` (sidebar admin → "Monetización"). Ya tiene modelo base:
`sponsors`, `sponsor_slots`, `sponsor_placements` y `sponsor_placement_events`.
La pantalla admin crea/edita/pausa/reactiva marcas, slots y placements, y muestra
KPIs desde eventos reales (sin revenue, CTR ni inventario ficticio).

Pendiente fuera de Fase 1: renderizar `active_sponsor_placements` en cada
superficie pública/cliente y llamar `recordSponsorPlacementEvent` desde esos
componentes para impresiones/clics reales.

### Buscar Match (`BuscoPartidoScreen`) — feature real gateada

El section `busco-partido` renderiza la feature real `BuscoPartidoScreen` +
`BuscoPartidoScreenView`: avisos de búsqueda, postulaciones y acciones
`match-seeks`. Mantiene el gate `match_seeks_enabled`; con el flag apagado,
la pantalla muestra `BuscoPartidoComingSoon`.

`BuscarMatchView.tsx` queda como prototipo visual descolgado. No debe volver al
dispatcher sin mapear su modelo de lobby al dominio real de match-seeks.

### Admin Planes premium — cola real + resumen real limitado

El section `admin-plans` ahora renderiza `AdminMatchPointPlusScreen.tsx`
(rediseño con tabs). Estado actual:

- **Cola de aprobación**: real y operativa. Usa `ApprovalQueue` con
  `approvePlanSubscriptionAdmin` / `rejectPlanSubscriptionAdmin` para pagos
  MATCHPOINT+ y `approveClubFeaturingAdmin` / `rejectClubFeaturingAdmin` para
  featuring de clubes.
- **Resumen**: muestra solo datos reales disponibles: suscripciones activas,
  pendientes, featuring activo y montos de registros recientes.
- **Planes & precios**: ya no aparece como tab visible; no hay modelo de promos,
  trial, plan anual ni precios editables en backend.

Pendiente: instrumentar eventos de producto si se quiere funnel real de paywall,
uso por feature, clicks o conversiones.

### Admin Membresías de club — ✅ MERGEADO (overview real)

Section `admin-memberships` ahora renderiza `AdminClubMembresiasScreen.tsx`
(server) y usa `adminListClubMemberships` real. Calcula socios activos,
pendientes, clubes con historial, valor mensual estimado (`price_cents /
duration_months`) y comisión estimada usando `platform_config.take_rate_pct`.
También restaura la lista cross-club real. No muestra churn, issues ni plantillas
globales porque no hay backend para esas señales.

### Club Membresías (rediseño) — ✅ MERGEADO (operativo parcial)

Section `club-membresias` (owner + manager) renderiza `ClubMembresiasScreen.tsx`.
El CRUD de tiers (`club_membership_tiers`) y la cola de socios pendientes están
cableados a actions reales (`saveClubMembershipTier`, `approveClubMembership`,
`rejectClubMembership`, `revokeClubMembership`). Ya no es demo operativo ni bloquea
la aprobación de pagos de membresía.

Residual: algunas reglas globales del diseño, como pausas/cancelación automática o
beneficios avanzados, siguen sin modelo persistente completo. Mantenerlas ocultas,
deshabilitadas o claramente marcadas hasta que exista backend.

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

### Admin Configuración v2 — ✅ MERGEADO parcial (platform_config real)

Section `admin-config` renderiza `AdminConfigScreenServer` → `AdminConfigView`.
Las filas con `cfg` leen y persisten keys reales de `platform_config` vía
`updatePlatformConfig` con audit. Las filas sin `cfg` quedan read-only como
constantes del app o integraciones pendientes. No hay tabla genérica
`platform_settings`.

### Admin de personalización — retirado

Las superficies admin anteriores de cosméticos y diseñador fueron removidas con
el reset. No hay path operativo ni placeholder activo hasta definir el nuevo
sistema.

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

### Club/Owner Personal — ✅ MERGEADO (roster real)

Section `club-staff` (owner + manager) renderiza `ClubStaffScreen` +
`ClubStaffScreenView`: staff real desde `role_assignments` + `profiles`, asignación
con términos (`assignRole`), revocación (`revokeRole`) y turnos (`shifts`) para ver,
crear y eliminar horarios.

Residual: nómina, sueldo mensual, performance y descuento de payout no tienen modelo
financiero completo. La UI muestra valores vacíos honestos para esos campos.

### Empleado Pro shop & bar v2 (rediseño) — ✅ MERGEADO (real, W4 Ola A)

Section `e-shop` renderiza `EmployeeProShopScreen` (server, lee `products` +
`product_categories` + `sales` + `cash_sessions` del club activo) → `EmployeeProShopView`
(client, mismo layout v2). PolHero + 4 tabs:

- **POS**: catálogo real (`products` activos del club) con stock visible, búsqueda +
  chips de categoría reales; carrito local con clamp por stock; cobro real vía
  `createSale` → RPC `fn_create_sale` (mig 039) — transacción atómica que escribe
  `transactions(kind='proshop_sale')` + `sales` + `sale_items` + decrementa `products.stock`
  + registra `inventory_movements` con `select … for update` para serializar concurrentes.
- **Inventario**: stats reales (SKUs/bajo stock/stock total/valor inventario), bajo
  stock con "+ Reponer" → `adjustProshopStock` (delta + reason `purchase`), tabla
  completa con "+ Stock" / ajuste con razón (`adjustment`/`damaged`/`return`).
- **Catálogo**: form de alta wired a `createProshopProduct` (nombre/SKU/categoría/
  precio/stock inicial/mínimo); grid con toggle activar/desactivar via
  `updateProshopProduct`.
- **Movimientos**: KPIs reales (ventas hoy/efectivo/digital/ticket promedio) +
  feed de ventas de hoy desde `sales` con join a `sale_items` + `transactions`.

Permisos: server actions validan staff del club (`requireClubStaff` admin/owner/
manager/employee), la RPC valida con `mp_club_staff(p_club_id) OR mp_is_employee_of(p_club_id)`.
Realtime: subscripción a `products`/`inventory_movements`/`sales` refresca el catálogo
cuando otra caja vende.

Pago: la RPC acepta `cash|card|transfer|wallet`; para `cash` requiere `cash_session`
abierto (raise `CASH.SESSION_CLOSED` si no hay). El cobro mapea los errores típicos
(`PROSHOP.OUT_OF_STOCK`, `INACTIVE`, `CURRENCY_MIXED`, `AUTH.ROLE_REQUIRED`) a copy en
español.

Pendiente (fuera de W4): anular venta dentro de 5min (reverso de stock + tx);
cierre de día / "Imprimir Z" enchufado a `cash_sessions.close`; carga de imagen
producto (`cover_url`) desde el form.

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
- **Acciones de campaña** (drawer): **Duplicar** (precarga el composer con
  título/cuerpo/segmentos), **Exportar CSV** (resumen client-side de la campaña),
  **Ver audiencia** (alcance real on-demand vía `countAudience`) y **Re-enviar a
  no-abridores** (`resendToNonOpeners` reusa `notify()` solo con `opened_at IS
  NULL`, gated a status=sent + confirm). Segmento **Capitanes de equipo**
  (`audience=team_captains`, ya soportado en `resolvePlatformTargetIds`) y builder
  **Añadir condición** (ciudad/deporte/segmentos) cableados.

**Pendiente real (no fakeado — requieren más que cablear):**
- **Clicks / conversión**: no hay señal de click separada de la apertura en el
  flujo de notificaciones → el funnel muestra solo hasta Abiertos (no inventa click).
- ⚠️ **Cron de programadas**: las `scheduled` no se auto-envían (necesita pg_cron +
  dispatcher SQL, o edge function, que duplica `notify()` — infra, se difiere). La
  UI ahora lo indica como "sin worker automático".
- **Best-time send**: necesita agregación de aperturas por hora. La UI ya no inventa
  hora ni uplift; muestra recomendación automática no disponible.
- **A/B test** y **"Generar con IA"**: features nuevas (variantes+tracking / integración
  Anthropic) — fuera de "cablear". `AdminBroadcastScreen`/`...View` reales preservadas.

### Admin oversight de coach/academia — gap cross-superficie

La academia tiene backend real para `coach_profiles`, `classes`, `class_sessions`,
`class_enrollments`, estudiantes y recursos, y pantallas operativas para coach/user.
Pero **no existe una pantalla admin dedicada** para supervisar coaches, clases,
matrículas, verificaciones, reviews o incidencias académicas. No se agrega item de
sidebar admin hasta tener una screen real con datos y acciones.

Para activar: `AdminAcademiaScreen` o `AdminCoachesScreen` con loaders admin-only
de coaches/clases/inscripciones, acciones de verificación/suspensión y auditoría,
más RLS/documentación de la superficie.

### Admin Pagos y Equipo MP — ✅ claims visibles ajustados

- `admin-pagos`: el KPI "Comisión MP" usa `platform_config.take_rate_pct`; ya no
  muestra 10% fijo si la configuración cambia.
- `admin-team`: la pantalla usa admins reales desde `role_assignments`, carga desde
  `tickets` y resoluciones desde `reports`. No hay presencia/last activity real; la
  UI muestra ese límite explícitamente en vez de simular usuarios online.

### `RoleScreenStub` — secciones del sidebar sin pantalla real

- **Archivo**: `src/components/dashboard/RoleScreenStub.tsx`
- **Cuándo aparece**: cada `(role, section)` que **no está** en el `SCREENS`
  map de `src/app/dashboard/[role]/[section]/page.tsx`.
- **Copy**: *"Pantalla específica del rol [ROLE]. Por ahora ves solo el
  Home con fidelidad completa; cada sección del sidebar tendrá su propia
  vista en la próxima iteración."*
- **Cobertura actual** (audit de roles 2026-07-01, confirmado leyendo
  `MP_ROLES[role].sidebar` vs el `SCREENS` map): **100% en los 7 roles**
  — ningún item de sidebar cae hoy a `RoleScreenStub`. La tabla previa
  (que listaba "1 item sin pantalla" para coach/manager/partner/owner)
  quedó desactualizada; este componente sigue existiendo como fallback
  honesto para cuando se agregue un item de sidebar nuevo antes de tener
  su pantalla lista.

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
- [x] ~~Cubrir items sin pantalla de employee/coach/manager~~.
  Resuelto — audit de roles 2026-07-01 confirmó 100% de cobertura en los
  7 roles (ver §"RoleScreenStub" arriba).
- [x] ~~Personalización de perfil V1~~.
  Retirada por reset completo. El nuevo sistema queda pendiente de diseño.
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
