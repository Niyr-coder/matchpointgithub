# 80 · Planes de jugador (freemium)

> Sistema de subscripción Free / Premium para usuarios finales (no clubes ni
> partners). Reusa el flujo de comprobantes manuales del Agente F: el upgrade
> crea una `transactions` `pending_proof`, el user sube comprobante de
> transferencia/DeUna, el admin aprueba y la subscripción se activa por N meses.

---

## Resumen

| Plan | Precio | Cobro | Limitaciones actuales |
|---|---|---|---|
| Free | USD 0 | — | Ninguna por ahora (gating pendiente — ver §6) |
| Premium | USD 5 / mes | Transferencia o DeUna, comprobante manual | — |

**Mecanismo de cobro:** sin PSP. Todo el ciclo de pago es manual:
1. Usuario solicita upgrade desde `/dashboard/user/mi-plan`.
2. El server crea una `transactions` en `pending_proof` + una fila en
   `player_subscriptions` con `status='pending'`.
3. El user es redirigido a `/pagos/[transactionId]` para subir comprobante.
4. Admin revisa el comprobante en `/dashboard/admin/admin-pagos`.
5. Cuando admin aprueba: la transaction pasa a `captured`, la subscription
   pasa a `active`, y `profiles.plan_tier` / `profiles.plan_expires_at` se
   actualizan.

---

## 1 · Modelo de datos

Migration: `supabase/migrations/048_player_plans.sql`.

### Enum `mp_player_plan`
```sql
create type mp_player_plan as enum ('free', 'premium');
```

### Columnas nuevas en `profiles`
| Columna | Tipo | Default | Notas |
|---|---|---|---|
| `plan_tier` | `mp_player_plan` | `'free'` | Tier vigente. |
| `plan_expires_at` | `timestamptz` | `null` | Cuándo vence. `null` para Free permanente. |

> Un user es **Premium activo** si `plan_tier='premium' AND (plan_expires_at IS NULL OR plan_expires_at > now())`. El helper `getPlanForUser` normaliza Premium expirado a Free para que el código consumidor no tenga que duplicar esa lógica.

### Tabla `player_subscriptions`
Historial completo de upgrades. Una fila por solicitud.

```
id uuid pk
user_id uuid → profiles(id)
tier mp_player_plan
status text check in ('pending','active','expired','cancelled','rejected')
starts_at timestamptz   -- null hasta que admin apruebe
expires_at timestamptz  -- null hasta que admin apruebe
duration_months int default 1
transaction_id uuid → transactions(id)   -- link al comprobante
cancelled_reason text
created_at timestamptz default now()
updated_at timestamptz default now()
```

**Índices:**
- `(user_id, status)` para listar subs del user.
- `(expires_at)` parcial `where status='active'` para futuro cron de expiry.

**RLS:**
- `select`: dueño (`user_id = auth.uid()`) o admin.
- `insert`: solo el dueño.
- `update`: solo admin.

---

## 2 · Server actions

Archivo: `src/server/actions/player-subscriptions.ts`.

### `requestPlanUpgrade({ tier, durationMonths })`
- **Caller:** usuario logueado.
- **Rechaza:** si ya hay otra subscription `pending` para el mismo `(user, tier)` → `PLAN.PENDING_EXISTS` (409). Esto evita comprobantes duplicados acumulados.
- **Side effects (en orden):**
  1. `insert into transactions (...)` con `kind='plan'`, `customer_user_id=userId`, `amount_cents = 500 * durationMonths`, `currency='USD'`, `method='transfer'`, `status='pending_proof'`, `club_id=null` (los planes no pertenecen a ningún club).
  2. `insert into player_subscriptions (...)` con `status='pending'`, `transaction_id` referenciando la transaction recién creada.
- **Retorna:** `{ subscriptionId, transactionId, amountCents }`. El cliente usa `transactionId` para redirigir a `/pagos/[transactionId]`.

### `approvePlanSubscriptionAdmin({ subscriptionId })`
- **Caller:** admin global (`role_assignments.role='admin'`).
- **Precondición:** la subscription debe estar en `status='pending'`. Otra fase → `PLAN.INVALID_STATE` (409).
- **Lógica de expiry:** si el user ya tiene `plan_expires_at` en el futuro, la nueva subscription **extiende desde ahí** (no desde hoy). Si no, arranca desde ahora.
- **Side effects:**
  1. `update player_subscriptions set status='active', starts_at, expires_at`.
  2. `update profiles set plan_tier=<sub.tier>, plan_expires_at=<newExpiry>`.

> **Importante:** esta action solo actualiza el plan. La aprobación del comprobante de pago en sí (`transactions.status = 'captured'`) la hace `approvePaymentProofAdmin` (Agente F) en `src/server/actions/payment-proofs.ts`. El flujo correcto en la UI admin es: aprobar comprobante → admin clickea separadamente "Activar plan" → llama esta action. Si se quiere automatizar (que approve del comprobante active el plan), hay que conectarlas (TODO §7).

### `getCurrentPlan()`
- **Caller:** usuario logueado.
- Lee `profiles.plan_tier` y `plan_expires_at` del user actual.
- Retorna `{ tier, expiresAt, active }` donde `active` es `true` si Free o si Premium no vencido.

---

## 3 · Helper de gating

Archivo: `src/lib/auth/plan.ts`. Para usar dentro de server actions.

### `getPlanForUser(supabase, userId): Promise<PlanStatus>`
- Lee `plan_tier` y `plan_expires_at` de `profiles`.
- **Normaliza:** Premium expirado → retorna `tier='free'` aunque la columna diga `premium`. Esto evita olvidar el check en cada caller.
- **User sin fila en `profiles`:** retorna `{ tier:'free', expiresAt:null, active:true }` (degradación segura, no bloquea).

### `requirePlan(supabase, userId, minTier): Promise<PlanStatus>`
- Lanza `MpError("PLAN.UPGRADE_REQUIRED", "Esta acción requiere plan Premium", 402)` si el plan efectivo del user es menor a `minTier`.
- Tier order: `free < premium`.
- Retorna el plan para uso downstream.

**Uso típico:**
```ts
import { requirePlan } from "@/lib/auth/plan";

export async function createTeam(input: unknown) {
  return runAction(CreateTeamSchema, input, async (data) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    await requirePlan(supabase, userId, "premium");   // ← gate
    // ... resto
  });
}
```

---

## 4 · Endpoints HTTP

Los endpoints REST de los planes **no existen todavía**. Las acciones se consumen via:
- Server components (e.g. `MiPlanScreen`) llaman directo a `getCurrentPlan` / lectura SQL.
- Client components (e.g. `MiPlanScreenView`) importan `requestPlanUpgrade` como server action.

Si en el futuro alguien necesita curl/Postman, agregar `/api/v1/me/plan` (GET para leer, POST para upgrade) usando el patrón de `src/app/api/v1/reservations/route.ts`.

---

## 5 · UI

### Banner en home del dashboard
Archivo: `src/components/dashboard/user/UserHomeView.tsx` (función `UpgradeBanner`).

Aparece arriba del grid principal cuando:
- `planTier === 'free'`, o
- `planTier === 'premium'` y expira en ≤ 7 días (`UPGRADE_WARN_DAYS`).

- Background: gradiente oscuro + ícono crown ámbar.
- CTA: `<Link href="/dashboard/user/mi-plan">Activar Premium →</Link>` (o "Renovar →" si está por expirar).
- Botón "×" para dismissar — **solo durante la sesión actual** (state local). No persiste entre recargas para que el aviso vuelva cuando el plan expire.
- Para guests (`meUserId === null`): no se muestra.

`UserHome.tsx` (server) extiende la query de `profiles` para traer `plan_tier` y `plan_expires_at`, los incluye en `UserHomeData` y los pasa al view.

### Pantalla `/dashboard/user/mi-plan`
Archivos: `src/components/dashboard/user/MiPlanScreen.tsx` (server) + `MiPlanScreenView.tsx` (client).

Registrada en el dispatcher: `src/app/dashboard/[role]/[section]/page.tsx` → `SCREENS.user["mi-plan"]`.

**Server component:**
- Llama `getCurrentPlan()`.
- Consulta `player_subscriptions` del user con `select * limit 20 order by created_at desc`.
- Pasa todo al view.

**Client view:**
- Card destacada con tier actual: badge gris (free) o verde (premium), `Plan activo hasta DD MMM YYYY` si premium.
- **Si Free:** botón "Activar Premium · USD 5/mes" → llama `requestPlanUpgrade({ tier: 'premium', durationMonths: 1 })`.
- **Si Premium activo:** botón "Extender 1 mes · USD 5" → misma action, server extiende desde el expiry vigente.
- **Query param `?upgrade=premium`** en la URL: dispara el upgrade automático al montar (1 sola vez, guard con `useRef`). Útil para CTAs externos.
- **Errores manejados:**
  - `PLAN.PENDING_EXISTS` → "Ya tienes una solicitud pendiente. Sube el comprobante o espera la aprobación."
  - `AUTH.UNAUTHENTICATED` → "Inicia sesión para activar Premium."
  - Otro → muestra `error.message`.
- **Tabla "Historial":** columnas Estado / Plan / Inicio / Vence / Comprobante. Si la fila tiene `transaction_id`, botón "Ver" enlaza a `/pagos/[transactionId]`.

---

## 6 · Estado actual del gating

| Feature | Status | Notas |
|---|---|---|
| Reservar canchas | ❌ sin gate | Reservas ilimitadas en Free (decisión: usar la app mucho NO debería ser premium-gated). |
| Inscribirse a eventos / torneos | ❌ sin gate | Sin restricción. |
| Crear teams | ✅ gated | `createTeam` en `src/server/actions/teams.ts` llama `requirePlan('premium')`. Free puede unirse via `joinTeamByCode` / `requestJoinTeam` pero no fundar. |
| Estadísticas avanzadas (UI) | ✅ gated | `RankingScreen` oculta el card "Tu evolución" (chart histórico + delta + período) a Free y muestra teaser con CTA a `/dashboard/user/mi-plan`. Free ve ranking, top 3, leaderboard y rating actual. |
| Crear matches/juegos sociales | ⏳ no aplica todavía | Las modales `CrearMatchModal` / `CrearJuegoModal` son UI mocks sin backend. Cuando se construya, decidir gate. |
| Multi-deporte | ⏳ TODO | Opcional: Free 1 deporte primario, Premium ilimitado. |
| Mensajería | ❌ sin gate | No recomendable gatear — fricción social mala para retención. |

**Hoy todos los users pueden hacer todo igual.** Premium se cobra y registra pero no diferencia experiencia. Hasta que se elija qué gatear, el upgrade es voluntario / "support the project".

---

## 7 · Fase 3 — operación end-to-end (✅ hecha)

### Cron de expiry — ✅
Migration `049_plan_cron_and_expiry.sql`. Instala `pg_cron`, crea `fn_process_player_plans()` y la programa diaria a las **08:00 UTC** (03:00 ECT, baja carga). La función:
- Marca subs `active` con `expires_at < now()` como `expired`.
- Normaliza `profiles.plan_tier='free'` y `plan_expires_at=null` para premium vencidos.
- Encola jobs `plan_expiring_soon` para subs activas con `expires_at` en los próximos 7 días.
- **Dedup:** no inserta si ya existe un job `pending|sent` para esa `subscription_id` en los últimos 7 días.

### Auto-activación al aprobar comprobante — ✅
`approvePaymentProofAdmin` (Agente F) ahora detecta `tx.kind='plan'` y llama `approvePlanSubscriptionAdmin` automáticamente. Si la sub asociada no existe, log warn y continúa (no aborta la aprobación del comprobante). El admin **ya no necesita** activar el plan en un segundo paso.

### Aviso de expiry inminente — ✅ encolado
Notification kind `plan_expiring_soon` registrado en `notification_kinds` con `category='plans'`, `allowed_roles=[user]`, `default_channels=[inapp]`. La función del cron encola un job con payload `{ subscription_id, tier, expires_at, days_remaining }`. **Dispatcher real de notif (envío push/email) sigue pendiente** — los jobs se acumulan en `notification_jobs` esperando consumer.

### UI admin para activar planes — ✅
Pantalla `/dashboard/admin/admin-plans` registrada en el dispatcher + sidebar admin. Server actions en `src/server/actions/admin-plans.ts`:
- `listPendingPlanSubscriptionsAdmin` — subs pending con join a profiles + transactions.
- `listRecentPlanSubscriptionsAdmin({ limit })` — historial.
- `rejectPlanSubscriptionAdmin({ subscriptionId, reason })` — marca rejected + audit log (`plan_subscription.admin_reject`).

KPIs en la pantalla: pendientes, activadas hoy, vencidas este mes. Cards de pendientes con preview del comprobante + botones "Aprobar plan" (reusa `approvePlanSubscriptionAdmin`) y "Rechazar" (modal con motivo).

### Endpoint público / API — ✅
- `GET /api/v1/me/plan` → `{ tier, expiresAt, active }`.
- `POST /api/v1/me/plan` body `{ tier, durationMonths? }` → `{ subscriptionId, transactionId, amountCents, nextStep: '/pagos/<txId>' }`.
- `GET /api/v1/me/plan/subscriptions` → array `{ id, tier, status, startsAt, expiresAt, durationMonths, transactionId, createdAt }`.

Mapeo de errores HTTP completo (401/400/409/500). Defensa en profundidad: `.eq('user_id', userId)` aunque RLS ya filtra.

---

## 8 · Pendientes verdaderos (fase 4)

| Item | Notas |
|---|---|
| Dispatcher de notificaciones real | `notification_jobs` se acumulan pero no se envían. Sin esto, `plan_expiring_soon`, `event_rescheduled`, `tournament_rescheduled` etc. no llegan al user. Es el bloqueador #1 para que el sistema completo "se sienta vivo". |
| Gating real por feature | Sub está cobrada y registrada pero Premium no diferencia experiencia hoy. Decidir qué se limita: candidatos en §6. |
| Activación de planes desde `/admin-plans` automatiza, pero el rechazo del comprobante asociado | Si el admin rechaza la sub, la transaction queda en `pending_proof`. Considerar reject combinado. |
| Plantilla email para `plan_expiring_soon` | Cuando exista el dispatcher, necesita un template. |
| Tests E2E del flujo completo de upgrade | Playwright cubriendo: request → upload proof → approve → plan active. |
| Gating en invitaciones de match | Bloqueado por falta de backend de matches. Cuando exista `createMatch` / `inviteToMatch` en `src/server/actions/`, aplicar `requirePlan('premium')` o un counter mensual con tope para Free. |

---

## 9 · Pruebas manuales

1. Como user Free, abrir `/dashboard/user/mi-plan` → ver tier Free.
2. Click "Activar Premium · USD 5/mes" → redirect a `/pagos/[id]`.
3. Subir cualquier imagen como comprobante (`PaymentProofView`).
4. Como admin, ir a `/dashboard/admin/admin-pagos` (o `/dashboard/admin/admin-plans` directamente), aprobar el comprobante.
5. **Automático ahora:** la sub pasa a `active`, `profiles.plan_tier='premium'`, `plan_expires_at = now + 1 mes`. Sin pasos extra.
6. Refrescar `/dashboard/user` → banner desaparece. Refrescar `/dashboard/user/mi-plan` → tier Premium con expiry visible.
7. Click "Extender 1 mes" → segundo comprobante. Tras aprobar, `expires_at` se extiende desde el primer expiry (no desde hoy).
8. Setear `expires_at` manualmente en el pasado → siguiente corrida del cron (o `select fn_process_player_plans()` manual) normaliza a free + encola `plan_expiring_soon` (si todavía estaba en ventana).

---

## 10 · Referencias

- Migrations: `supabase/migrations/048_player_plans.sql`, `049_plan_cron_and_expiry.sql`.
- Actions: `src/server/actions/player-subscriptions.ts`, `src/server/actions/admin-plans.ts`.
- Helper gating: `src/lib/auth/plan.ts`.
- UI user: `src/components/dashboard/user/MiPlanScreen.tsx`, `MiPlanScreenView.tsx`, `UserHomeView.tsx` (banner).
- UI admin: `src/components/dashboard/admin/AdminPlansScreen.tsx`, `AdminPlansScreenView.tsx`.
- Dispatcher: `src/app/dashboard/[role]/[section]/page.tsx`.
- REST: `src/app/api/v1/me/plan/route.ts`, `src/app/api/v1/me/plan/subscriptions/route.ts`.
- Página pública con tiers: `src/components/landing/precios/PreciosPageView.tsx`.
- Flujo de comprobantes (dependencia): `src/server/actions/payment-proofs.ts` (con auto-activación de planes).
