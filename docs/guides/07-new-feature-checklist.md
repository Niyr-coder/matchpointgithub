# Checklist · nueva feature en MatchPoint v2

> **Definition of done** para cualquier feature nueva. Si saltás un ítem,
> ahí es donde se va a romper. La skill `matchpoint-feature-plan` te recorre
> esto interactivamente; este doc es la referencia escrita.

La regla principal: **MatchPoint tiene N superficies por feature** (server
action, RLS, realtime publication, audit, notif, OpenAPI, UI, docs).
Tocar 1 sin las otras = el feature parece funcionar pero la sincronía
muere en silencio.

---

## 0 · Pre-implementación (siempre)

Antes de escribir una línea:

- [ ] Leer los docs aplicables (la skill `matchpoint-docs-guide` mapea
  área → docs obligatorios).
- [ ] **Leer `docs/guides/00-roles.md`** si la feature toca permisos,
  sidebar items, badge counts, o roles que la consumen.
- [ ] **Leer `docs/guides/04-placeholders.md`** para entender qué cuenta
  como "placeholder honesto" vs "WIP escondido", y dónde registrarlos.
- [ ] Buscar si la tabla/función/notif/kind YA existe — `create table if
  not exists` esconde divergencias (regla `feedback_check_schema_before_migrate`).
- [ ] Identificar las **superficies afectadas** (cuántos consumers ven la
  data: pantalla X, widget Y, panel Z, notif W).
- [ ] Mapear qué roles consumen / mutan / ven la feature.
- [ ] Decidir si la feature **necesita rollout gradual** (→ feature flag,
  ver §1.10) o se puede mergear directo.
- [ ] Pensar qué necesita **admin para gestionarla** (listar, override,
  killswitch — ver §1.9). Si el answer es "nada", verificar dos veces:
  features sin path admin son anti-pattern en MatchPoint.

---

## 1 · Backend

### 1.1 Schema (`supabase/migrations/NNN_*.sql`)

- [ ] **Naming**: numeración 3 dígitos zero-padded, snake_case
  (`102_team_rename_count.sql`). Verificar último número en
  `supabase/migrations/`.
- [ ] **Tipos correctos**:
  - IDs `uuid primary key default gen_random_uuid()`.
  - Timestamps `timestamptz default now() not null`.
  - Enums via `check (col in (...))` o tipo dedicado si reusable.
- [ ] **Foreign keys** con `on delete` explícito (`cascade`, `set null`,
  `restrict`). Pensar qué pasa cuando se borra el parent.
- [ ] **Indices** en columnas usadas en filtros/joins frecuentes (`btree`
  default; `gist` para tstzrange).
- [ ] **Triggers automáticos**:
  - `tg_audit_<table>` si toca la tabla con admin (ver `03-audit-log.md`).
  - `tg_<table>_set_updated_at` si tiene `updated_at`.
  - Triggers de negocio (ej. bump `last_message_at` en `conversations`).
- [ ] **Migration aplica idempotente** (`create or replace function`,
  `if not exists` solo si justificado).
- [ ] **Aplicar vía MCP Supabase** o `supabase db push` y verificar.

### 1.2 RLS (`docs/architecture/30-rls.md` §9)

- [ ] `alter table <t> enable row level security;`
- [ ] Policy `select` per rol que debe leer.
- [ ] Policy `insert` con `with check` validando ownership.
- [ ] Policy `update` con `using` validando ownership.
- [ ] Policy `delete` o restringir total (devolver UPDATE soft-delete).
- [ ] **Cliente correcto** desde el server:
  - `getServerClient()` para reads del propio user (la RLS aplica).
  - `getAdminClient()` para mutaciones admin (RLS bypassed; validar rol
    a mano ANTES).
  - SECURITY DEFINER RPC para reads cross-tenant que un user normal
    necesita (ej. `fn_unread_messages_count`).
- [ ] Si usás `getAdminClient` para mutar, llamar `setAuditActor(admin,
  callerId, "admin")` antes (ver §1.4).

### 1.3 Realtime (`docs/architecture/50-realtime.md` §15)

- [ ] ¿El cliente necesita escuchar esta tabla en vivo? Si sí:
  - [ ] `alter publication supabase_realtime add table public.<tabla>;`
    en una migration.
  - [ ] Actualizar tabla §15 del doc con el nuevo registro.
- [ ] En el cliente, `useRealtimeRefresh`:
  - [ ] **Siempre con filter** si la tabla es hot (`transactions`,
    `tournaments`, `profiles`, `player_stats`, `audit_log`). Sin filter
    = cada cliente abierto recibe TODOS los eventos = costo.
  - [ ] `event: "INSERT"` si solo te interesan creaciones (no updates
    de score por score).
  - [ ] `debounceMs` apropiado: 300ms default, 2000-5000 para Admin*
    pantallas con tablas calientes.
  - [ ] Usar `onChange` callback en lugar de `router.refresh()` global
    si solo necesitás refetch puntual.

### 1.4 Audit log (`docs/security/03-audit-log.md`)

- [ ] ¿La acción la dispara un admin/owner sobre data ajena? → debe
  registrarse en `audit_log`.
- [ ] Agregar `tg_audit_<table>` trigger en la migration de la tabla
  (si todavía no existe).
- [ ] En la server action que muta via `getAdminClient()`:
  ```ts
  const admin = await getAdminClient();
  await setAuditActor(admin, callerId, "admin");
  await admin.from("X").update(...);
  ```
  Sin `setAuditActor`, audit queda con `actor=null, role=system`.
- [ ] Action name catalogada en el doc audit.

### 1.5 Server actions (`src/server/actions/`)

- [ ] Validación de entrada con Zod schema en `src/lib/schemas/`.
- [ ] Wrapper `runAction(SchemaParser, input, async (params) => { ... })`.
- [ ] Auth: usar `requireSession()` (cached) en lugar de
  `auth.getUser()` directo.
- [ ] Errores con código en el registry (`MpError("FEATURE.X_REACHED",
  msg, status)`).
- [ ] Return `ActionResult<T>` con `{ ok: true, data }` o `{ ok: false,
  error }`.
- [ ] Si es lista, agregar `.limit()` defensivo aún si la UI no muestra
  más (defensa contra users con historia infinita).

### 1.6 Notificaciones (`docs/guides/02-notifications.md`)

- [ ] ¿La acción dispara una notif a otro humano? Si sí:
  - [ ] Definir nuevo `kind` en una migration que actualice
    `notification_kinds` seed.
  - [ ] Agregar branch en `fn_dispatch_inapp_notifications` (Postgres
    function) o usar el dispatcher TS según el patrón del feature
    vecino.
  - [ ] Definir `allowed_roles` y `default_channels`.
  - [ ] Definir `category` para preferencias de usuario.
  - [ ] Actualizar §6 del doc de dominio que corresponda
    (tournaments §6, plus §4, payments, etc).

### 1.7 OpenAPI (`docs/architecture/60-openapi.md`)

- [ ] La spec se autogenera desde Zod schemas exportados. Asegurar:
  - [ ] El schema de input está en `src/lib/schemas/<feature>.ts` y se
    exporta.
  - [ ] El return type está en el mismo file.
  - [ ] Aparece en `/openapi.json` después de rebuild.

### 1.8 Platform config (`docs/guides/03-platform-config.md`)

- [ ] ¿La feature tiene un parámetro de negocio (precio, porcentaje,
  límite, flag)? → guardarlo en `platform_config`, NO hardcoded.
- [ ] Default razonable y seed en migration.
- [ ] Helper `getPlatformConfig("key")` para leerlo.

### 1.9 Admin governance (capacidades y permisos)

Cada feature en MatchPoint debe ser **operable desde /admin**. Si el feature
no tiene path admin, ya naciste con un bug operacional: ni soporte ni el
fundador pueden investigar/intervenir cuando algo se rompe en producción.

Capacidades a definir (todas opcionales pero la mayoría aplica):

- [ ] **Listar todas las instancias** (cross-tenant). Ej: admin ve TODOS
  los teams, no solo los suyos. Pantalla candidata: `AdminUsersScreen`,
  `AdminEventsScreen`, o **panel nuevo** si la feature lo merece.
- [ ] **Inspeccionar un registro individual** (drilldown). Modal o ruta.
- [ ] **Editar/forzar** (override las reglas normales): cambiar caps de
  un team específico, marcar como verificado, banear, etc.
- [ ] **Killswitch o pausa** vía `feature_flags` o `platform_config`
  (ver §1.10).
- [ ] **Ver audit trail** filtrado por entidad — la pantalla
  `AdminAuditScreen` ya filtra por entidad si el `audit_log` registra
  `entity_type` + `entity_id`.

**Permisos y roles** (`docs/guides/00-roles.md`):

- [ ] Si la feature introduce **un nuevo permiso o rol**, registrarlo
  en `/dashboard/admin/admin-roles` (AdminRolesScreen) — esa pantalla
  es el catálogo operativo de permisos y debe reflejar el actual estado.
- [ ] Si la feature cambia qué ve un rol existente, actualizar la
  matriz de `00-roles.md` §5 (sidebar items) o §6 (matriz de permisos).
- [ ] Si el sidebar de un rol gana un item, registrarlo en
  `src/lib/roles.ts` (`MP_ROLES[role].sidebar`).

**Antipatrón**: implementar feature, pasarlo a producción, y solo
después darse cuenta que no hay forma admin de listar/editar/pausar.
Resultado: cada bug se vuelve "soporte abre Supabase Studio".

### 1.10 Feature flags (`feature_flags` table — ver `AdminFlagsScreen`)

Decidir **antes de empezar** si la feature va detrás de flag.

**Sí necesita flag** cuando:

- Rollout gradual (% de users, beta cohort).
- Killswitch en producción (apagar sin revert/deploy).
- A/B test (comparar versiones).
- Feature riesgosa con posibilidad de regressions cross-surface.
- Feature dependiente de algo externo (integración 3rd party, cron) que
  podría no estar listo.

**NO necesita flag** cuando:

- Cambio small + reversible vía revert del PR.
- Bug fix.
- Feature interna admin-only (admin ya es el cohort beta).
- Cambio cosmético/copy.

**Cómo agregar un flag**:

1. Seed en migration: `insert into feature_flags(key, enabled_default, ...)`.
2. Helper `isFeatureEnabled(key, userId?)` lee del cache per-request.
3. Server actions guard: si flag off, lanzar `MpError("FEATURE.DISABLED", ...)`.
4. UI guard: render alternativo (placeholder o vista clásica) si flag off.
5. `AdminFlagsScreen` automáticamente lista el nuevo flag — admin puede
   togglearlo sin redeploy.

**Defaults seguros**:

- Feature beta/riesgosa → `enabled_default: false`.
- Feature ya validada → `enabled_default: true`.
- Killswitch puro (feature en uso, podemos apagarla) → `enabled_default: true`.

---

## 2 · Frontend

### 2.1 Server component (data fetching)

- [ ] `React.cache` para funciones reusadas en el mismo render
  (`getProfileSummary` ya es ejemplo).
- [ ] `Promise.all` para queries paralelas independientes.
- [ ] `.limit()` defensivo en lo que pueda crecer indefinidamente.
- [ ] Si necesitás profile data, **siempre** vía `getProfileSummary`,
  no fetch directo a `profiles`.

### 2.2 Client component (interacción)

- [ ] `"use client"` declarado arriba.
- [ ] `useTransition` para optimistic updates.
- [ ] `useToast` para feedback de éxito/error con copys breves.
- [ ] Status enums cubiertos con helper (`txStatusMeta` etc), no
  ternarios inline.
- [ ] Loading skeleton coherente con el resto (ver
  `05-design-system.md`).

### 2.3.b Animaciones y polish (`emil-design-eng` skill)

Si la feature introduce **transiciones**: modal/drawer entra-sale,
toast slide-in, hover/active states de botones, popover desplegable,
animación de elementos lista, etc — invocar la skill `emil-design-eng`
durante la implementación.

La skill enforce:

- [ ] **Easing custom**, no built-in: `--ease-out`, `--ease-in-out`,
  `--ease-drawer` (todos en `globals.css`). Nunca `ease-in` en UI.
- [ ] **Duración** según tipo: 100-160ms feedback botón, 125-200ms
  tooltip, 150-250ms dropdown/select, 200-500ms modal/drawer.
- [ ] **Origin** desde el trigger: popover `transform-origin: top right`
  (o donde vive el trigger). Modales se quedan center.
- [ ] **Scale mínimo de entrada**: `scale(0.95)` o superior — nunca
  `scale(0)`. Combinar con `opacity: 0 → 1`.
- [ ] **Botones presionables**: `transform: scale(0.97)` en `:active`
  con `transition: transform 160ms ease-out`.
- [ ] `prefers-reduced-motion` respetado — animation: none cuando
  el user lo pide.
- [ ] **No animar acciones de teclado** (Cmd+K, Esc, etc) — se ven
  ~100 veces al día y la animación las hace sentir lentas.

Antipatrones detectados por la skill:

- `transition: all 300ms` → especificar exact properties.
- `scale(0)` → nada en la realidad aparece de la nada.
- `transform-origin: center` en popovers anchored.
- Duraciones > 300ms en UI cotidiana.

### 2.3 Responsive (`docs/guides/06-responsive.md`)

- [ ] Tailwind con prefijo `md:` para layout responsive.
- [ ] Inline style para design tokens fijos.
- [ ] NO usar `gridTemplateColumns: "1fr 1fr"` outer — siempre
  `grid grid-cols-1 md:grid-cols-2`.
- [ ] Verificar con `agent-browser`:
  ```bash
  npx agent-browser set viewport 390 844
  npx agent-browser open http://localhost:3000/<route>
  npx agent-browser screenshot mobile.png
  npx agent-browser set viewport 1440 900
  ```
- [ ] Confirmar: sin scroll horizontal, cards stackean en mobile,
  desktop intacto.

### 2.4 Sincronía cross-superficie

- [ ] Mapear TODAS las pantallas que muestran la data afectada.
  Ejemplo torneo cancelado:
  - `/eventos` (público)
  - `/dashboard/user` (widget "Mis torneos")
  - `/dashboard/partner/p-torneos` (panel del organizador)
  - `/dashboard/admin/admin-events` (vista admin)
  - Notif a inscritos
- [ ] Cada superficie tiene realtime con filter apropiado, O hace
  refetch post-mutation.
- [ ] Si la mutación es del propio user, `router.refresh()` después de
  la action.

### 2.5 Matriz de visibilidad (rol × permiso × flag)

Antes de codear, llenar esta matriz **por cada dato nuevo** del feature.
Expone gaps que la lista de superficies de §2.4 no captura — ej. un rol
que ve la pantalla pero no debería ver cierto subset del data.

| Dato | Pantalla | Rol que lo ve | Permiso runtime | Feature flag | Notas |
|---|---|---|---|---|---|
| ej. team roster | `/dashboard/user/team` | user (miembro) | ser miembro del team | — | público dentro del team |
| ej. team roster | `/dashboard/admin/admin-users` | admin | role=admin | `admin_view_teams` | cross-tenant |
| ej. rename count | (interno) | server only | — | — | no se expone al cliente |

**Reglas**:

- **Rol**: listar los `RoleKey` afectados (`user`, `admin`, `owner`,
  `manager`, `partner`, `coach`, `employee`). "todos" = public read.
  "ninguno cliente" = server-only.
- **Permiso runtime**: condición que el rol debe cumplir (ser captain,
  ser miembro, ser dueño del recurso, ser MP+, etc). Si basta el rol,
  poner "—".
- **Feature flag**: si el feature está detrás de un flag de la tabla
  `feature_flags`, nombrarlo. Si todavía no existe pero el rollout
  debe ser gradual, **proponer crearlo** en una migration de seed.
- **Notas**: edge cases (data sensible que el rol ve solo de su scope,
  data global que solo admin ve cross-tenant, etc).

**Cuándo necesitás feature flag**:

- Sí: beta, rollout gradual, A/B test, killswitch en prod.
- No: cambio small + reversible vía revert del PR.

**Output complementario** (debajo de la matriz, en bullets):

- 🔓 Datos que cualquier user logueado ve sin restricción.
- 🔐 Datos gated por rol/permiso (con la condición exacta).
- 🚩 Datos detrás de feature flag (nombre + default state).
- 🔒 Datos server-only (nunca expuestos al cliente).

**Gaps típicos que detecta la matriz**:

- Pantalla muestra data del rol X pero el dato pertenece a Y → RLS leak.
- Permiso runtime no validado en server (solo UI) → bypass via API.
- Flag activado pero la query no lo filtra → data sigue visible.
- "Admin ve todo" pero la RLS de admin no fue agregada → admin queda
  sin acceso silencioso.

### 2.6 Placeholders / WIP (`docs/guides/04-placeholders.md`)

Si dejaste algo a medias intencionalmente (UI placeholder, server stub,
mock data, hardcoded value pendiente de mover a `platform_config`):

- [ ] Registrarlo en `docs/guides/04-placeholders.md` con:
  - Archivo:línea exacta.
  - Qué falta concretamente para quitar el stub.
  - Quién/cuándo se planea reemplazarlo (rough — sprint, milestone).
- [ ] Si es UI, mostrarlo como **placeholder honesto** (badge "Pronto",
  ícono lock, copy explícito) — NO como feature funcional que silenciosa-
  mente no hace nada.
- [ ] Si es backend, devolver explícito `MpError("FEATURE.NOT_READY", ...)`
  en vez de fallar silencioso o devolver mock.

**Antipatrón**: stubear "rápido para mergear" sin registrar — 6 meses
después nadie sabe que esa UI es vacía y un user reporta bug por algo
que nunca fue feature real.

---

## 3 · Cross-cutting

### 3.1 Errores

- [ ] Códigos en formato `DOMINIO.MOTIVO` (UPPER_SNAKE).
- [ ] Mensajes en español ecuatoriano neutro con tuteo.
- [ ] HTTP status correctos (400 validación, 401 unauth, 403 forbidden,
  404 not found, 409 conflict, 500 server).

### 3.2 Seguridad

- [ ] No exponer service-role key, secrets fuera de `.env.local`.
- [ ] No log de PII en server logs.
- [ ] Validar ownership ANTES de mutar (no confiar en RLS sola para
  prevenir corrupción semántica).

### 3.3 Privacy (`docs/privacy/`)

- [ ] ¿La feature recolecta datos personales nuevos? → registrar en
  `00-data-collection.md`.
- [ ] ¿Cambia quién ve qué? → actualizar matriz cross-rol
  (`01-data-sharing.md`).
- [ ] ¿Tiene retención específica? → agregar a `02-retention.md` con
  cron de cleanup si aplica.

---

## 4 · Docs (en la misma tanda del feature)

- [ ] `docs/architecture/20-database.md` §29 si agregaste tabla/función.
- [ ] `docs/architecture/30-rls.md` §9 si tocaste policies o el patrón
  admin-client.
- [ ] `docs/architecture/50-realtime.md` §15 si agregaste al publication.
- [ ] `docs/architecture/40-api.md` o §70 (screen-to-api) si agregaste
  server action nueva.
- [ ] `docs/product/<dominio>.md` si cambió un flujo de negocio.
- [ ] `docs/guides/02-notifications.md` si agregaste notif kind.
- [ ] `docs/guides/00-roles.md` si cambió quién ve qué, sidebar items,
  o se introdujo permiso/rol nuevo.
- [ ] `docs/guides/04-placeholders.md` si dejaste un WIP/stub
  intencional (registrar archivo:línea + qué falta).
- [ ] `docs/guides/03-platform-config.md` si agregaste key nueva.

> Si NO actualizás el doc en la misma tanda, el próximo dev (o el
> próximo Claude) repite el bug.

---

## 5 · QA antes de cerrar

- [ ] `npx tsc --noEmit` limpio.
- [ ] `npm run lint` limpio (o `--quiet` si solo warnings preexistentes).
- [ ] **Si se tocó UI: invocar skill `matchpoint-ui-review`** —
  revisa botones que se rompen con labels largos, hover sin gate de
  `pointer:fine`, `.btn` + inline overrides, text overflow sin
  ellipsis, animaciones Emil-compliant.
- [ ] `npx agent-browser` smoke test del happy path en mobile y desktop.
- [ ] Edge cases: empty state, max state, error state, unauthenticated
  state, rol incorrecto.
- [ ] Si tocaste pagos/premium: probar el flujo manual end-to-end
  (transferencia → comprobante → admin aprueba → notif).
- [ ] Migration aplicada al proyecto remoto (verify con
  `mcp__plugin_supabase_supabase__execute_sql`).

---

## Resumen ejecutivo

| Capa | Toco si |
|---|---|
| Schema | Agrego/cambio tabla, columna, enum, índice, trigger |
| RLS | Nueva tabla, cambio de visibilidad, mutación admin |
| Realtime | El cliente debe ver updates sin refresh |
| Server action | Nueva mutación o read complejo |
| Audit | Admin/owner muta data ajena |
| Notif | La acción notifica a otro humano |
| OpenAPI | Nueva server action o endpoint |
| Platform config | Hay un parámetro de negocio variable |
| **Admin governance** | **Casi siempre** — admin debe poder listar/inspeccionar/forzar/pausar |
| **Feature flag** | Rollout gradual, killswitch, A/B, dependencias externas |
| **Roles** | Sidebar/permisos cambian, o se introduce nuevo rol/permiso |
| Frontend | Hay UI |
| Sync cross-surface | Más de una pantalla muestra la data |
| **Placeholders** | Dejé algo a medias intencionalmente |
| Privacy | Nueva data personal o cambia quién la ve |
| Docs | SIEMPRE — al menos uno de los anteriores |

Si tu feature toca solo 1-2 capas, probable que sea un fix pequeño y no
necesita todo este overhead. Si toca 4+, este checklist te ahorra
horas de bugs cross-surface en producción.
