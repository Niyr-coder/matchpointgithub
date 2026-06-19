# Seguridad · overview

> Si vas a tocar auth, sessions, cookies, helpers de rol o algo que diga
> "admin only" — leelo. Las decisiones aquí no son intuitivas y romperlas
> casi siempre crea agujeros silenciosos.

## 1. Modelo de auth

- **Supabase Auth** maneja signup, login, password reset, email
  confirmation. Usuario = row en `auth.users`.
- Cada user tiene 1 row en `profiles` (mismo `id`) — trigger lo crea al
  signup.
- Roles vienen de `role_assignments` (multi-rol por user). Ver
  `guides/00-roles.md`.

Stack:
```
Browser ──► proxy.ts (middleware) ──► Server Component / Route Handler
                                          │
                                          ├── getServerClient() — anon + cookies
                                          ├── getAdminClient() — service role (server-only)
                                          └── getSession() — wrapper sobre Supabase Auth
```

## 2. Sessions y cookies

| Cookie | Set por | Lee | Propósito |
|---|---|---|---|
| `sb-<ref>-auth-token` | Supabase Auth | Supabase | JWT access token |
| `sb-<ref>-auth-token.0/1` | Supabase Auth | Supabase | Refresh token chunks |
| `mp_active_role` | `switchRole`, signup | layouts, `getSession()` | Rol activo del user en la UI |
| `mp_active_club_id` | `switchRole` cuando aplica | layouts/queries | Contexto de club activo (cuando admin/owner gestiona varios) |

`COOKIE_OPTS` definido en `src/server/actions/auth.ts`: `httpOnly: true`,
`secure: true` en prod, `sameSite: 'lax'`, path `/`.

`getSession()` retorna `{ authenticated, session: { userId, activeRole,
roles } } | { authenticated: false }`.

## 3. `proxy.ts` (middleware)

Archivo `src/proxy.ts` (no usa nombre `middleware.ts` para evitar magia de
Next que ya cambió varias veces — config en `next.config.mjs` lo registra).

Hace:
1. **Refresh de tokens** si están por vencer (Supabase Auth lib).
2. **Redirecciones**: si user no auth y va a `/dashboard/*` → `/?auth=signin`.
3. **Carga rol activo** desde cookie y la inyecta como context.

No hace:
- Authz fine-grained (eso vive en server actions con `require*`).
- Validación de roles por path (eso vive en layouts).

## 4. Helpers de auth

| Helper | Archivo | Propósito |
|---|---|---|
| `getSession()` | `src/lib/auth/session.ts` | Resolver session + roles del cookie/Supabase |
| `requireUserId()` | `src/lib/auth/session.ts` | Tira si no auth, devuelve uid vía `getClaims()` + fallback `getUser()` |
| `requireAdminUserId()` | varios | Tira si no admin activo |
| `requirePartnerAdmin(partnerId)` | `tournaments.ts` | Tira si no es owner/admin del partner_org |
| `requireTournamentEditor(tournamentId)` | `tournaments.ts` | Admin global o partner_admin del torneo |
| `mp_is_admin()` (SQL) | mig 003+ | Helper SECURITY DEFINER para RLS |
| `mp_is_partner_admin_of(partner_id)` (SQL) | mig 003+ | Helper SECURITY DEFINER (fix recursión) |
| `mp_club_staff(club_id)` (SQL) | mig 003+ | Helper para staff de un club |

**Regla**: usar siempre estos helpers en lugar de chequear roles ad-hoc.
Centraliza la lógica de auth.

## 5. Server actions vs API routes

Dos puertas para mutar:

### Server actions (`src/server/actions/*.ts`)
- Marcadas con `"use server"`
- Llamadas desde client components vía import directo
- Tipadas con Zod via `runAction(Schema, input, fn)`
- Wrappers automáticos:
  - Validación de input (Zod)
  - Error handling (`MpError`, `AuthError`)
  - Idempotency opcional (`withIdempotency`)

### REST API (`src/app/api/v1/*`)
- Route handlers Next.js (Request → Response)
- Usadas por SDK externo + algunos webhooks
- Mayoría delega en server actions
- Auth: cookie session igual que server actions

**Patrón**: server actions son la fuente de verdad. REST es shell delgado.

## 6. Threat model alto-nivel

| Amenaza | Mitigación actual | Estado |
|---|---|---|
| SQL injection | Supabase + parametrización | ✅ |
| XSS (script injection) | React escape default + no `dangerouslySetInnerHTML` | ✅ |
| CSRF | Cookie sameSite=lax + server actions tienen origin check de Next | ✅ |
| Auth bypass | RLS + helpers `require*` en cada server action | ✅ pero ver §7 |
| Privilege escalation | RLS bloquea cross-tenant; service role solo en server | ✅ |
| Service role leak | `import "server-only"` en `client.admin.ts` | ✅ |
| Session hijack | httpOnly cookie + Supabase refresh + HTTPS prod | ✅ |
| Rate-limit abuse | Token bucket Postgres + fail-closed en auth/sales/proofs | ✅ (P0/P1) |
| Brute force login | Supabase Auth + assertRateLimit signup/signin | ✅ |
| Comprobante falso | `proof_rejection_reason` flow + audit log | 🟡 manual |
| Data scraping de profiles | `profiles_authn_select_limited` deja leer todos | 🟠 ver privacy/01 |

## 7. Findings del audit reciente (estado actual)

✅ **OK**:
- `getAdminClient` tiene `import "server-only"`.
- Ningún `NEXT_PUBLIC_*` filtra secretos.
- Rutas API verifican sesión.
- Tablas públicas (`clubs`, `courts`, `brackets`, etc) con `using (true)` —
  correcto.
- RLS de `player_subscriptions` con `with check (user_id = auth.uid())` —
  correcto.

🟠 **Pendiente**:
- **Profiles RLS** — flag `profiles_rls_strict` (default OFF); encender tras staging.
- **Cron secret** — compare timing-safe vía `authorizeCron` (P3).
- **CSP enforce** — hoy report-only en `next.config.ts` (P3).

🔴 **Resuelto reciente** (P0–P1):
- Vistas SECURITY DEFINER → `security_invoker` + drop `v_unread_notifications`.
- Rate limit RPC solo service_role; `/api/v1/contact/sales` limitado.
- `/api/health` requiere `HEALTH_SECRET` en prod.
- `AdminApplicationDetail` aislado en `src/server/queries/admin-applications.ts`
  con `server-only` para que `getAdminClient` no pueda llegar al cliente
  por accidente de refactor.
- `submitPaymentProof` ahora usa admin client tras auth check (antes
  fallaba silencioso por RLS).
- `console.log` en `TopBar` con `uid` y payloads — borrados.

## 8. Reglas para devs

1. **Auth siempre primero** en server actions:
   ```ts
   const uid = await requireUserId();    // o requireAdminUserId(), etc.
   // ahora puedes mutar.
   ```
   Para actions simples que solo necesitan `user.id`, importa
   `requireUserId()` desde `src/lib/auth/session.ts`. No uses este fast-path
   en proxy, recovery, password reset ni flujos sensibles que necesitan
   verificación fresca contra Auth.

2. **Service role solo después de auth**:
   ```ts
   await requireAdminUserId();
   const admin = getAdminClient();       // ahora sí.
   ```

3. **Nunca importar `getAdminClient` en un archivo "use client"**. El
   módulo lo bloquea con error de build (`import "server-only"`). Si te
   tira ese error: aislar la query en `src/server/queries/...` y exportar
   solo lo necesario.

4. **`NEXT_PUBLIC_*` solo para valores públicos** — URL de Supabase, anon
   key, public site URL. NUNCA service role, SMTP password, etc.

5. **Cuando agregues una tabla**, definir RLS desde el día 1. Sin RLS, la
   tabla es leíble por cualquier autenticado.

6. **Contexto DB activo (`app.active_role` / `app.active_club_id`)**:
   Supabase JS/PostgREST no ofrece hoy un `SET LOCAL` seguro que aplique a
   todas las queries posteriores del cliente. No llames `set_config(...,
   false)` desde app code para esto porque puede filtrarse entre requests con
   pooling. Si una policy necesita ese contexto, envuelve la operación en una
   RPC específica que reciba `active_role` / `active_club_id` y ejecute
   `set_config(..., true)` dentro de la misma transacción, o cambia la policy
   para derivar el scope desde tablas.

7. **Patrones de error**:
   - `MpError` para errores de negocio (404, 409, 422) — visible al user.
   - `AuthError` para auth/autz fallida.
   - `Error` genérico para bugs internos — log + mensaje genérico al user.

## 9. Próximas tareas de seguridad (TODO)

- [ ] Activar `profiles_rls_strict` en staging → prod (ver migración P2)
- [ ] PostGIS manual: `scripts/ops/apply-postgis-rls.sql`
- [ ] CSP enforce (quitar report-only)
- [ ] Subresource Integrity en scripts CDN (Scalar de /docs)
- [x] 2FA staff (TOTP) — infra lista (`staff_mfa_required` off; ver §10)
- [ ] 2FA staff — UI enroll/verify + encender flag en staging
- [ ] Audit log de logins (hoy solo loguea mutaciones)
- [ ] Penetration test profesional pre-launch público

## 10. 2FA staff (TOTP) — infraestructura

Política acordada: **todos los roles excepto jugador** (`user`) exigen TOTP cuando
el flag `staff_mfa_required` está encendido. Jugadores siguen con Google /
email sin segundo factor.

| Pieza | Ubicación | Estado |
|---|---|---|
| Política / constantes | `src/lib/auth/mfa-policy.ts` | ✅ |
| Gate dashboard | `src/app/dashboard/[role]/layout.tsx` | ✅ (solo si flag on) |
| Lectura AAL + factores | `src/lib/auth/mfa.ts` | ✅ |
| Flag reader | `src/server/flags/staff-mfa.ts` | ✅ |
| Server actions | `src/server/actions/mfa.ts` | ✅ |
| Rutas stub | `/auth/mfa/enroll`, `/auth/mfa/verify` | ✅ placeholder |
| UI QR + código | `MfaEnrollPlaceholder`, `MfaVerifyPlaceholder` | ⏳ conectar |

**Activación (cuando la UI esté lista):**

1. Supabase Dashboard → Authentication → Multi-Factor → **App Authenticator ON**
2. Admin panel → flag `staff_mfa_required` → ON (o migración / SQL)
3. Smoke: staff sin factor → `/auth/mfa/enroll`; con factor → `/auth/mfa/verify` → `aal2`

**Server actions sensibles:** importar `requireStaffMfaAal2({ activeRole, supabase })`
después de validar sesión.
