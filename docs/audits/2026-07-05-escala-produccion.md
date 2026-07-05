# Auditoría de readiness a escala (producción) — 2026-07-05

> **Alcance:** Next.js 16.2.6 (App Router) + Supabase (Postgres / PostgREST /
> Realtime) + Vercel. Auditoría de solo lectura del código y config reales,
> cruzada con `docs/architecture/*`. Rama: `fix/torneos-latencia-marcador`.

---

## 0. Veredicto ejecutivo

| Escala objetivo | ¿Listo? | Condición |
|---|---|---|
| **Beta cerrada (~100–500 concurrentes)** | **Condicional SÍ** | Arreglar el doble-approve de comprobantes (**P0-1**) primero — es corrupción de dinero que ocurre a cualquier escala (doble clic de un admin). El resto tolera este rango. |
| **~1.000 concurrentes** | **NO** | Bloquea el fanout de realtime sin filtro (**P0-2**): `UserHomeView` dispara `router.refresh()` (~18 queries) en TODOS los usuarios del home ante cualquier inscripción del país. |
| **~10.000 concurrentes** | **NO** | Se cae Realtime primero (límite de conexiones WS + egress + evaluación por suscripción), y en paralelo: índices faltantes en las tablas que más crecen, `auth.getUser()` ×3 por request contra GoTrue, y cero observabilidad real (Sentry es un stub). Requiere rediseño (broadcast en vez de `postgres_changes`), tier Supabase Pro+ y monitoreo. |

**Lo que está sorprendentemente bien (no rehacer):**

- Los clientes de DB van por **PostgREST**, no por conexión directa a Postgres —
  el pooling lo gestiona Supabase. El riesgo clásico de "serverless reventando
  el límite de conexiones" no aplica aquí.
- **Rate limiting real** por token-bucket en Postgres, cableado en casi todas
  las mutaciones calientes.
- El peor race de cupo (doble-booking del último lugar) **ya está blindado** con
  un trigger `FOR UPDATE`.
- El bug histórico "waitlist contada como inscrito" **ya está corregido**.
- Índices calientes mayormente presentes (GIN en `player_ids`, parcial de
  notificaciones no leídas).
- Caché `unstable_cache(60s)` + `revalidateTag` en el listado público de torneos.

---

## 1. Bloqueantes priorizados (P0 / P1)

| # | Sev | Dimensión | Archivo:línea | Qué rompe / a qué escala | Fix |
|---|---|---|---|---|---|
| **P0-1** | P0 | Pagos | `payment-proofs.ts:208`, `partner-tournament-registrations.ts:700` | Doble-aprobación de comprobante: el `UPDATE` filtra solo por `id`, sin compare-and-swap sobre `status`. Dos aprobaciones concurrentes corren la cascada de captura dos veces → doble activación de plan/featuring + doble conteo de ingresos. Muerde desde ~100 usuarios. | Añadir `.eq("status","proof_submitted")` al `UPDATE` y correr la cascada **solo si** devolvió fila (rowcount=1). Convierte la aprobación en CAS: gana exactamente un caller. |
| **P0-2** | P0 | Realtime | `UserHomeView.tsx:130,134` | `{table:"tournaments"}` y `{table:"registrations"}` **sin filtro**, modo default → `router.refresh()` (~18 queries). Es el home de casi todo jugador. Una inscripción a cualquier torneo del país → hasta N clientes, cada uno con ~18 queries. A ~1.000 concurrentes ≈ 18k queries por ventana de debounce. | Filtrar los dos watches por ids relevantes (`useScopedRealtimeRefresh`) o quitarlos y refrescar solo la sección afectada con `onChange`. Es el amplificador #1. |
| **P0-3** | P0 | Realtime | `MensajesScreenView.tsx:878-879` | `{table:"messages"}` y `{table:"conversations"}` **sin filtro**. `messages` es la tabla con más escrituras. Aunque usa `onChange` (no `router.refresh`), Realtime debe empujar **cada mensaje de la plataforma a cada cliente con Mensajes abierto** → revienta el cap de mensajes/seg y egress hacia ~10k. | Mover `messages`/`conversations` a un topic **broadcast por conversación** (`realtime.broadcast_changes`) en vez de `postgres_changes` sin filtro. |
| **P1-1** | P1 | Realtime | `AmigosScreenView.tsx:107`, `BuscoPartidoScreenView.tsx:217-219` | `{table:"matches"}` (+ `match_seeks`, `match_seek_applications`) **sin filtro**, default → `router.refresh()`. `matches` es tabla caliente; cada usuario refresca ante cualquier cambio de match del país. Muerde a ~1k. | Filtrar por participante/creador, o pasar a `onChange` con gate `isRelevant`. |
| **P1-2** | P1 | Observabilidad | `observability/sentry.ts:12-20` | `captureError` es un **stub**: solo `console.error` salvo que `SENTRY_DSN` esté seteada (no lo está). A escala quedas ciego a errores de producción más allá de logs de Vercel. | Cablear `@sentry/nextjs` (o equivalente) real; setear `SENTRY_DSN`. |
| **P1-3** | P1 | Índices | `transactions.customer_user_id` (sin índice) | La RLS `tx_customer_select` (`customer_user_id = auth.uid()`) corre en cada lectura de "mis pagos" + export + admin. `transactions` es la tabla que más rápido crece (1 fila por reserva/venta/torneo/proshop). Seq-scan a 10k+ filas. | `create index concurrently idx_transactions_customer on transactions (customer_user_id) where customer_user_id is not null;` |
| **P1-4** | P1 | Índices | `conversation_members.user_id` (inutilizable) | La PK es `(conversation_id, user_id)`, así que `user_id` va de cola y no sirve para "mis conversaciones" (inbox) ni para la RLS `cm_self_select`. Seq-scan a 10k+ membresías. | `create index concurrently idx_conversation_members_user on conversation_members (user_id);` |
| **P1-5** | P1 | Jobs/crons | `vercel.json`, `.env.example:19` | Los 4 crons corren **una vez al día** (límite Hobby) en lotes acotados (email 50, borrados 25, purga 100, sorteos 20). A escala las colas no drenan: tope de 50 emails/día; la purga de comprobantes (100/día) deja proofs >24h si hay más de 100/día (riesgo LOPDP). | Supabase/Vercel Pro + crons `*/5` (ya contemplado en `.env.example`); subir batch o paralelizar; `maxDuration` en los crons. |

---

## 2. Detalle por dimensión

### 2.1 Supabase / conexiones — VERDE (dimensionar tier)

Todos los clientes server-side usan `@supabase/ssr` / `supabase-js`, que hablan
por **PostgREST sobre HTTPS**, no por conexión directa a Postgres:
`getServerClient` (`src/lib/db/client.server.ts`, envuelto en `React.cache`),
`getRouteClient` (`client.route.ts`), `getAdminClient` (`client.admin.ts`,
singleton de módulo, `persistSession:false`), y `createServerClient` en
`proxy.ts:62` para refrescar cookies. El único uso de `pg` crudo está en scripts
de ops (`apply-migrations-staging.ts`, `wipe-db.ts`), no en el path de request.
`supabase/.temp/pooler-url` (puerto 5432 = session pooler) es metadata del CLI
para migraciones, no del runtime.

**Cuellos reales:** el pool de PostgREST hacia Postgres (según tier), GoTrue/Auth
(demasiados `getUser()` por request, §2.5), y conexiones WS de Realtime (§2.4).
**Severidad: P3** — arquitectura correcta.

### 2.2 RLS performance — AMARILLO

Las policies (475 `CREATE POLICY` en 266 migraciones) están bien diseñadas y
usan helpers `SECURITY DEFINER` marcados `STABLE` (`mp_is_admin`,
`mp_has_club_access`, etc.), evitando recursión. Pero:

1. **`auth.uid()` nunca se envuelve en subselect.** Aparece en 80 archivos de
   migración; `(select auth.uid())` aparece en **0**. La recomendación oficial de
   Supabase es `(select auth.uid())` para que el planner lo evalúe una vez
   (InitPlan) en vez de por fila. Igual para las llamadas a helpers
   (`(select mp_is_admin())`).
2. **Subqueries correlacionadas por fila** en tablas calientes: `reservations.
   res_select`, `registrations.reg_visible`, `bracket_matches.bm_partner_write`,
   `ticket_messages.tm_visible`.

**Mitigante:** la policy de `registrations` con `auth.uid() = any(player_ids)`
**sí tiene índice GIN** (`idx_registrations_player_ids_gin`, mig 052).

**Rompe primero:** ~1.000–10.000 filas por tenant. **Severidad: P2** — conviene
una migración que reescriba las ~6 tablas más calientes al patrón `(select ...)`.

### 2.3 Índices — VERDE (2 gaps P1)

176 `CREATE INDEX`. Tablas calientes mayormente cubiertas: notifications (índice
**parcial** `WHERE read_at is null`, calza exacto con la campana), registrations
(`tournament_id`, compuesto, GIN en `player_ids`), bracket_matches /
tournament_group_matches (`tournament_id` indexado), reservations, player_stats,
ranking_snapshots, role_assignments, match_seeks, quedadas, audit_log,
paywall_events.

**Gaps:** `transactions.customer_user_id` (**P1-3**),
`conversation_members.user_id` (**P1-4**), y P3: `bracket_matches.side_a/b_
registration_id`, `transactions.cash_session_id`, `registrations.registered_by`,
`messages.sender_id`.

**Nota operativa:** ninguna migración usa `CREATE INDEX CONCURRENTLY`. Sobre una
tabla ya grande en prod, `CREATE INDEX` normal **bloquea escrituras** durante el
build. Futuras migraciones de índice deben usar `CONCURRENTLY` (fuera de
transacción). **Severidad de proceso: P2.**

### 2.4 Realtime / fanout — ROJO (el mayor riesgo de escala)

**El motor de amplificación:** `src/components/dashboard/useRealtimeRefresh.ts`
en modo default dispara `router.refresh()` (línea 74) = re-render del árbol
server ≈ **~18 queries por evento**. Debounce trailing 1500ms throttlea la
frecuencia por cliente pero **no reduce el ancho del fanout**. Si el watch no
lleva `filter`, `postgres_changes` entrega **cada cambio de esa tabla a ese
cliente**. Hay ~75 tablas en el publication `supabase_realtime`.

**Lo que está bien:** la única suscripción global montada para todo usuario (la
campana en `TopBar.tsx:514-542`) **está filtrada** por `recipient_user_id`. Y
muchas pantallas de torneo/club/perfil **sí filtran** (`tournament_id=eq.`,
`club_id=eq.`, `user_id=eq.`).

**Riesgos sin filtro (rankeados):** `UserHomeView` (**P0-2**), `MensajesScreenView`
(**P0-3**), `Amigos`/`BuscoPartido` (**P1-1**), `PartnerHomeView` (gatea
client-side pero igual recibe todo el país por el cable), y una cola P2/P3 de
pantallas de usuario/staff/admin.

**Techo arquitectónico:** `postgres_changes` evalúa cada cambio contra cada
suscripción (con chequeo RLS por cliente) en el nodo Realtime → costo
~O(escrituras × suscripciones) **incluso con filtros** (los filtros cortan
egress y refresh, no la evaluación por cliente). El fix definitivo es
**broadcast DB-side por topic** (`realtime.broadcast_changes`).

**Qué rompe primero:** ~100 nada se cae (desperdicio); ~1.000 revienta la
amplificación `router.refresh()` (UserHomeView); ~10.000 se cae Realtime primero
(cap de conexiones WS ~500 en tiers bajos → la campana muere en silencio; cap de
mensajes/seg y egress; CPU del nodo por evaluación por suscripción).

### 2.5 Next.js / Vercel — AMARILLO

- **Caching:** páginas públicas son `force-dynamic` → SSR por visita. Mitigado en
  la capa de datos con `unstable_cache({revalidate:60})` + `revalidateTag`
  on-demand. Residual: cómputo SSR por hit en la landing. **P3.**
- **Auth amplification (N+1 de `getUser`):** una navegación a `/dashboard/*` hace
  **~3 validaciones de auth y ~5-6 round-trips secuenciales** (`proxy.ts` +
  `getSession` + `getMyEffectiveFlags` sin caché, cada uno con su `getUser()`).
  Existe un fast-path `getClaimsAuth()` (verificación local del JWT) que **el
  layout no usa**. **P2** — paralelizar con `Promise.all`, migrar a `getClaims`,
  cachear flags.
- **`getAdminClient` en paths de lectura (bypass RLS):** 472 usos en 104
  archivos. Intencional y documentado (`30-rls.md §9.1`), pero para muchas
  lecturas la RLS **no es** la última línea de defensa — la correctitud depende de
  filtros manuales. **P2** — pasar a revisar los `src/server/queries/*` que usan
  admin client y confirmar que todos filtran por el caller.
- **Vercel functions:** **no hay `maxDuration`** en ningún lado → default (10s
  Hobby / 15s Pro). Los crons con loops secuenciales pueden exceder el timeout a
  lote lleno. **P2.**

### 2.6 Rate limiting / abuso — VERDE (hueco de borde)

Rate limiter real (`src/lib/api/ratelimit.ts`): token-bucket en Postgres vía
`fn_rate_limit_consume`, con límites tuneados (auth 5/min IP, mutations 60/min,
paymentProof 10/h, tournamentRegister 20/h, etc.) y `failClosed` en
auth/proofs/sales. Cableado en torneos, giveaways, eventos, reservas, proshop,
caja, comprobantes, auth y el endpoint público de ventas.

**Idempotencia:** `withIdempotency` en registro de torneo, pero **opt-in** (no-op
si el cliente no manda header). El backstop es rate limit + trigger anti-duplicado.

**Huecos:** no hay rate limiting a nivel edge/WAF (`proxy.ts` no limita); los GET
públicos `/api/v1/*` dependen solo de la protección de plataforma de Vercel.
**P2.** Cada `assertRateLimit` es un round-trip extra a Postgres. **P3.**

### 2.7 Pagos / concurrencia — AMARILLO→ROJO (1 P0)

**Bien (no rehacer):** el doble-booking del último cupo **no puede pasar** —
trigger `tg_enforce_registration_caps` (`20260716000000_...:22-86`) con
`for update` (:48) serializa y re-cuenta bajo lock; backstopea también los paths
de partner. "Waitlist contada como inscrito" **corregido** (conteos centralizados
en `ACTIVE_REGISTRATION_STATUSES`).

**Problemas:**
- **P0-1** — Doble-approve de comprobante (ver §1). *La "doble conteo sistémica"
  del audit financiero previo sigue viva por esta vía.*
- **P2** — Transacción huérfana: en `registerToTournament` el `INSERT` de
  `transactions` (`tournaments.ts:746-760`) ocurre antes y en otra transacción
  que el `INSERT` de registration (:767). Si el trigger rechaza la registration,
  queda un cargo pendiente sin inscripción. Fix: insertar registration primero o
  meter ambas en un RPC `SECURITY DEFINER`.
- **P2** — El trigger de caps no conoce `allow_waitlist`: el perdedor del race
  recibe `raise exception` → 500 en vez de ir a waitlist.
- **P2 (dormido)** — Webhook PSP: dedup check-then-insert no atómico
  (`webhook-handler.ts:25-54`), backstopeado por unique constraint;
  `psp_checkout_enabled` off hoy. Blindar al encender PSP.
- **P3** — Duplicado en waitlist (sin unique constraint sobre array `player_ids`);
  Idempotency-Key opt-in.

### 2.8 Jobs / crons / background — AMARILLO

4 crons en `vercel.json`, todos **diarios** (límite Hobby), autenticados por
`CRON_SECRET`, lotes acotados: `dispatch-email` (08:00, 50/run, loop secuencial
a Resend), `giveaway-draws` (09:00, 20/run), `process-account-deletions` (03:00,
25/run), `purge-payment-proofs` (05:00, 100/run; borra archivo Storage + nulea
`proof_url`, nunca la fila — compliance OK).

**Problemas:** frecuencia diaria + lotes chicos = las colas no drenan a escala
(**P1-5**); sin `maxDuration` el loop de email puede timeoutear a lote lleno
(**P2**). El fix ya está contemplado en `.env.example:19` ("En Pro puedes usar
`*/5`").

---

## 3. Acciones recomendadas (orden de ROI)

1. **P0** — CAS en aprobación de comprobantes (`payment-proofs.ts:208`,
   `partner-tournament-registrations.ts:700`). *Bloquea beta.*
2. **P0** — Filtrar/quitar los watches sin filtro de `UserHomeView.tsx:130,134`.
   *Bloquea 1k.*
3. **P0** — `messages`/`conversations` a broadcast por conversación
   (`MensajesScreenView.tsx:878-879`). *Bloquea 10k.*
4. **P1** — Cablear Sentry real; sin esto escalar es a ciegas.
5. **P1** — Índices `transactions.customer_user_id` y
   `conversation_members.user_id` (con `CONCURRENTLY`).
6. **P1** — Plan Supabase/Vercel Pro + crons `*/5` + `maxDuration` en crons.
7. **P1** — Filtrar `matches` en Amigos/BuscoPartido.
8. **P2** — Reordenar registro (registration antes que transaction) o RPC;
   envolver `auth.uid()` en `(select ...)` en las 6 tablas más calientes;
   paralelizar/`getClaims` en el layout; rate limit edge para GET públicos;
   revisar `src/server/queries/*` con admin client.

---

## 4. Conclusión

La base es más sólida de lo que sugiere el volumen de hallazgos: la plomería de
conexiones, el rate limiting y la protección del cupo están bien resueltos. El
**gate para beta** es un solo P0 de dinero (CAS en comprobantes). El **gate para
crecer** es arquitectónico y concentrado: el patrón `postgres_changes` sin filtro
→ `router.refresh()` no escala más allá de ~1k, y su rediseño a broadcast +
filtros es el trabajo grande pendiente antes de abrir el grifo de usuarios. En
paralelo, moverse a tier Pro (crons sub-diarios, `maxDuration`) y encender
observabilidad real son prerequisitos de "saber cuándo se rompe".
