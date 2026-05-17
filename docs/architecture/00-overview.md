# 00 · Overview de arquitectura

> Documento fuente de verdad. Todo lo que se construya debe respetar este overview o actualizarlo primero.

---

## 1. Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | **Next.js 16 App Router · React 19 · TypeScript estricto · Tailwind v4** | Server Components por defecto, `"use client"` solo donde haya estado/eventos |
| Auth | **Supabase Auth** (email+password, magic link, OAuth Google/Apple) | JWT con claim `role` custom |
| DB | **Postgres 15 (Supabase)** con RLS habilitada por tabla | Single-DB multi-tenant por `club_id` |
| Realtime | **Supabase Realtime** (Postgres CDC + Broadcast channels) | Tipado en `src/lib/realtime/` |
| Storage | **Supabase Storage** | Avatars, club covers, resources, paddle/court photos |
| API hacia el dashboard | **Server Actions** (mutaciones) + **Route Handlers REST** `/api/v1/*` (lecturas) | Zod en input/output siempre |
| Validación | **Zod 3** + **@asteasolutions/zod-to-openapi** | Una sola fuente de schemas |
| Docs API | **OpenAPI 3.1** generado · **Scalar UI** servida en `/docs` | Autogenerada desde Zod |
| Mail | **Resend** | Plantillas en `src/emails/` (React Email) |
| Push web | **Web Push API** propio (no FCM por ahora) | VAPID keys en env |
| Jobs / colas | **pg_cron** + tabla `notification_jobs` · **Edge Functions** para entrega | Sin Redis por ahora |
| Observabilidad | **Sentry** (errores) + **Vercel Analytics** (rendimiento) + tabla `audit_log` (negocio) | |
| Pagos | **Stripe** (international) + **Mercado Pago** (LATAM) | Webhooks en `/api/v1/webhooks/{provider}` |
| Tests | **Vitest** + **Playwright** + **pgTAP** para policies RLS | |

---

## 2. Principios

1. **Pixel-perfect ya quedó en el front. Ahora: datos-perfect.** Cada pantalla debe dibujarse con datos reales del schema sin transformaciones cosméticas en cliente. Si la UI necesita un campo, ese campo existe en la DB o en la vista materializada.
2. **Una sola fuente de verdad por capa.**
   - Tipos de dominio → Zod schemas en `src/lib/schemas/`
   - Tipos de DB → `src/lib/db/types.ts` generado por `supabase gen types`
   - Estos dos se cruzan en los Server Actions y nunca se duplican a mano
3. **RLS primero, código después.** Toda tabla con datos de tenant nace con RLS habilitada y políticas mínimas. Sin RLS, no se commitea.
4. **Server Actions son la API interna; Route Handlers son la API pública.** Un cliente externo puede consumir `/api/v1/*`; los componentes del dashboard prefieren Server Actions (sin overfetch, sin URL building).
5. **Cada endpoint y cada acción tiene Zod en input y output.** Sin excepción.
6. **Realtime es opt-in por componente.** No nos suscribimos a todo en el layout. Cada hook decide a qué canal entra y se desuscribe limpio.
7. **Idempotencia explícita.** Toda mutación que crea recursos acepta `Idempotency-Key` opcional. Webhooks de pago obligatoriamente idempotentes.
8. **Auditoría = pura DB.** Triggers `AFTER INSERT/UPDATE/DELETE` escriben a `audit_log` con `actor_id`, `actor_role`, `entity`, `entity_id`, `action`, `diff jsonb`. No depender del código de aplicación para auditar.

---

## 3. Modelo de identidad y roles

### Tabla `users` (extiende `auth.users` de Supabase)

```
auth.users (gestionada por Supabase)
  └── public.profiles (1:1) — datos visibles del usuario
        ├── role_assignments (N) — qué roles tiene y dónde
        └── notification_preferences (N) — preferencias por rol×kind×canal
```

### Roles

| Rol | Scope | Notas |
|---|---|---|
| `admin` | Global plataforma | Solo MatchPoint staff |
| `partner` | Federación / liga | Owns leagues + tournaments, asigna clubes |
| `user` | Global (sin tenant) | Default de todo signup |
| `owner` | `club_id` único | Dueño del club, máxima autoridad dentro del club |
| `manager` | `club_id` único | Operación día a día del club |
| `coach` | `club_id` (puede pertenecer a varios) | Da clases, ve sus alumnos |
| `employee` | `club_id` único | Recepción / caja / soporte in-situ |

> Un mismo `user_id` puede tener **múltiples role_assignments**. Ejemplo: María es `user` global, `owner` del club X y `coach` del club X y del club Y. El RoleSwitcher cambia el "rol activo" de la sesión.

### Rol activo y JWT

- Al login, el JWT lleva `app_metadata.roles[]` con todas las asignaciones.
- El frontend guarda el `active_role` en cookie `mp_active_role` (HttpOnly, SameSite=Lax).
- Cada Server Action / Route Handler lee la cookie y valida con `assertRole({role, scope})`.
- Postgres lee el rol activo vía `current_setting('app.active_role', true)` configurado por el middleware antes de cada request (mediante `SET LOCAL`).

```sql
-- Helper Postgres
create or replace function auth.active_role() returns text
language sql stable as $$
  select current_setting('app.active_role', true)
$$;

create or replace function auth.active_club_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.active_club_id', true), '')::uuid
$$;
```

---

## 4. Multi-tenancy

- **Single Postgres database**. Cada tabla "tenant" tiene columna `club_id uuid not null references clubs(id)`.
- **RLS por defecto**: una sesión solo puede leer/escribir filas cuyo `club_id` esté en la lista de clubes para los que el usuario tiene un `role_assignment` activo Y donde el `active_role` permita esa operación.
- **Tablas globales** (sin `club_id`): `profiles`, `friendships`, `ranking_snapshots`, `tournaments`, `leagues`, `events_global`, `notifications` (de tipo cross-tenant), `feature_flags`, `audit_log_global`.
- **Cross-club joins** se permiten sin problema porque todo vive en la misma DB.
- **Función helper** `auth.has_club_access(club_id, required_role)` se usa en todas las policies para no repetir lógica.

```sql
create or replace function auth.has_club_access(p_club_id uuid, p_role text default null)
returns boolean language sql stable as $$
  select exists(
    select 1 from role_assignments ra
    where ra.user_id = auth.uid()
      and ra.club_id = p_club_id
      and (p_role is null or ra.role = p_role)
      and ra.revoked_at is null
  );
$$;
```

---

## 5. Convenciones de naming

| Cosa | Convención | Ejemplo |
|---|---|---|
| Tabla | `snake_case` plural | `reservations`, `notification_jobs` |
| Columna | `snake_case` singular | `club_id`, `created_at`, `cancelled_at` |
| PK | siempre `id uuid default gen_random_uuid()` | |
| FK | `<entidad>_id` | `court_id`, `coach_id` |
| Timestamps | `created_at`, `updated_at`, `deleted_at` (soft delete opcional) | trigger `set_updated_at` |
| Enum tipo | `mp_<dominio>_<concepto>` | `mp_reservation_status` |
| Vista materializada | `mv_<concepto>` | `mv_user_ranking` |
| Function | `verb_subject` | `enqueue_notification`, `compute_ranking` |
| Policy | `<table>_<role>_<action>` | `reservations_owner_select` |
| Trigger | `tg_<table>_<event>_<purpose>` | `tg_reservations_after_insert_notify` |
| Schema Zod | `<Entidad>Schema` / `<Entidad>CreateSchema` / `<Entidad>UpdateSchema` | `ReservationSchema` |
| Endpoint REST | `/api/v1/<dominio>/<recurso>` | `/api/v1/reservations` |
| Server Action | `<verb><Subject>` exportada de `src/server/actions/<dominio>.ts` | `createReservation`, `cancelReservation` |

---

## 6. Estructura de carpetas (tras Fase 2)

```
src/
  app/
    (public)/              # landing, marketing
    (auth)/                # login, signup, reset
    dashboard/             # ya migrado (8 roles × pantallas)
    api/v1/                # Route Handlers REST
    api/webhooks/          # Stripe, Mercado Pago, otros
    docs/                  # Scalar UI sirviendo openapi.json
  components/              # ya migrado
  lib/
    db/
      client.server.ts     # supabase server client (cookies)
      client.browser.ts    # supabase browser client
      client.admin.ts      # service role (server-only, never bundled)
      client.route.ts      # para Route Handlers
      types.ts             # generado por supabase gen types
    schemas/               # Zod por dominio: identity.ts, reservations.ts, ...
    api/
      errors.ts            # MpError, MpHttpError, mapper a HTTP
      response.ts          # ok(), fail() helpers tipados
      openapi/             # generador + registro de paths
    auth/
      session.ts           # getSession, getActiveRole, assertRole
      roles.ts             # roleCan(role, action)
    realtime/
      channels.ts          # builder tipado de canales
      hooks/               # useReservationsChannel, useChatChannel, ...
    notifications/
      catalog.ts           # NOTIFICATION_KINDS
      dispatch.ts          # enqueueNotification
  server/
    actions/               # Server Actions por dominio
    services/              # lógica de negocio reutilizable
    jobs/                  # workers para notification_jobs
  emails/                  # React Email templates
supabase/
  migrations/              # 001_identity.sql, 002_clubs.sql, ...
  seed.sql                 # data demo
  functions/               # edge functions (push dispatcher, etc.)
docs/
  architecture/            # estos docs
  openapi.json             # generado por script
```

---

## 7. Auth flow detallado

```
1. Usuario entra a /login
2. Supabase Auth (email+pass o OAuth) → set cookies sb-access-token / sb-refresh-token
3. Middleware en src/middleware.ts:
   a. Lee sb-access-token, hidrata sesión
   b. Lee cookie mp_active_role (si no existe, usa el primer role_assignment)
   c. Carga role_assignments del user → si active_role no está en la lista, redirect /403
   d. Inyecta headers x-active-role y x-active-club-id a la request
4. En Server Actions / Route Handlers:
   - getSession() lee cookies, devuelve { user, activeRole, activeClubId, allRoles }
   - assertRole({ role: 'owner' }) o assertCan('reservation.create') tiran si no
   - Antes del query: pgClient.rpc('set_local_context', { active_role, active_club_id })
5. RLS filtra automáticamente.
```

El **switch de rol** desde el RoleSwitcher hace `POST /api/v1/auth/switch-role { role, clubId? }` que:
- Valida que el user tenga ese `role_assignment`
- Actualiza la cookie `mp_active_role`
- Refresca la sesión cliente

---

## 8. Formato de respuestas API

Todas las respuestas siguen el shape **discriminated union** para que el cliente no haga try/catch innecesarios:

```ts
// Éxito
{ ok: true, data: T, meta?: { page, pageSize, total } }

// Error
{ ok: false, error: { code: string, message: string, fields?: Record<string,string[]>, requestId: string } }
```

| HTTP | Cuándo |
|---|---|
| 200 | Éxito read/update |
| 201 | Éxito create |
| 204 | Éxito delete |
| 400 | Zod validation fail (lleva `error.fields`) |
| 401 | No autenticado |
| 403 | Autenticado pero sin permiso (rol o RLS) |
| 404 | Recurso no existe **o** no es visible para el rol activo (no leak) |
| 409 | Conflicto (idempotency-key colisión, slot reservado mientras tanto) |
| 422 | Regla de negocio violada (ej: cancelar reserva ya consumida) |
| 429 | Rate limit |
| 500 | Bug. `requestId` siempre incluido |

Códigos de error de dominio (`error.code`) en `SCREAMING_SNAKE` y namespaced: `RESERVATION.SLOT_TAKEN`, `PAYMENT.CARD_DECLINED`, `AUTH.ROLE_REQUIRED`.

---

## 9. Versionado

- API se sirve siempre bajo `/api/v1/`. Breaking changes → `/api/v2/`.
- Zod schemas exportan `version: 1` en el OpenAPI. Cambios aditivos no rompen versión.
- DB migraciones numeradas `NNN_<dominio>_<descripcion>.sql`, never edited after merge — solo follow-ups.

---

## 10. Rate limiting

- Por IP + por user_id, en middleware con tabla `rate_limit_buckets` (token bucket en Postgres, sin Redis).
- Defaults: 100 req/min anon, 600 req/min auth.
- Endpoints sensibles (login, signup, password reset, OTP) bajan a 5/min.

---

## 11. Idempotencia

- Tabla `idempotency_keys (key text pk, user_id uuid, response jsonb, created_at)`.
- Si llega un `Idempotency-Key` ya usado en últimas 24h, devolvemos la respuesta cacheada.
- Obligatorio en: `POST /reservations`, `POST /payments`, `POST /tournaments/.../register`, webhooks.

---

## 12. Storage

| Bucket | Quién sube | Acceso |
|---|---|---|
| `avatars` | user (self) | público read, write self |
| `club-covers` | owner/manager del club | público read, write con RLS |
| `club-courts` | owner/manager | público read, write con RLS |
| `resources` | coach | privado, signed URLs por enrollment |
| `tickets-attachments` | autor del ticket | privado, signed URLs |
| `kyc-docs` | partner/owner | privado, solo admin lee |

Toda subida pasa por `POST /api/v1/uploads/sign` que devuelve URL firmada limitada a 1MB-10MB según bucket y al user activo.

---

## 13. Próximos docs

| # | Doc | Estado |
|---|---|---|
| 00 | overview | ✅ este |
| 10 | domains | siguiente |
| 20 | database | siguiente |
| 30 | rls | fase 1b |
| 40 | api | fase 1b |
| 50 | realtime | fase 1b |
| 60 | openapi | fase 1b |
