# Roles

> Antes de tocar permisos, sidebar items, o cualquier feature gated por
> rol — leer este doc. Los roles son **multi-asignables** (un user puede
> ser user + partner + owner simultáneamente) y el sidebar se elige por
> URL/cookie, no por "rol primario".

## 1. Catálogo de roles

Definidos en `src/lib/roles.ts` (`RoleKey`):

| Rol | Color | Badge | Para quién | Asignación |
|---|---|---|---|---|
| `user` | verde `#10b981` | JUGADOR | Cualquiera con cuenta | Auto al signup |
| `owner` | negro | DUEÑO | Dueño legal del club | Auto al aprobar `club_application` |
| `manager` | negro | MANAGER | Operador diario del club | Owner invita |
| `employee` | negro | EMPLEADO | Personal de mostrador/caja | Owner invita |
| `coach` | negro | COACH | Instructor de clases | Owner invita + onboarding propio |
| `partner` | negro | PARTNER | Organizador de torneos externo (no club) | Admin asigna (CRM) |
| `admin` | rojo `#dc2626` | ADMIN | Equipo MATCHPOINT | SQL manual (no UI) |

## 2. Asignación: `role_assignments`

Tabla `role_assignments` (mig 003+):
- `user_id`, `role`, `club_id?`, `partner_id?`
- `granted_at`, `granted_by`, `revoked_at` (soft delete)

Un usuario tiene N rows en `role_assignments`. Filtrar por
`revoked_at IS NULL` para "roles activos".

```sql
-- Ejemplo: usuario con varios roles activos
select role, club_id, partner_id
from role_assignments
where user_id = '...' and revoked_at is null;
-- role=user, club_id=null, partner_id=null
-- role=partner, club_id=null, partner_id=<uuid>
-- role=owner, club_id=<uuid>, partner_id=null
```

## 3. Cookie `mp_active_role` + URL `/dashboard/[role]`

El **rol activo** del usuario en la UI se determina por:

1. URL `/dashboard/[role]/*` — fuente principal cuando el user navega vía el
   sidebar de un rol. Layout `src/app/dashboard/[role]/layout.tsx` valida
   que el user tenga ese rol en `role_assignments` (admin puede ver
   cualquier rol — "view as").
2. Cookie `mp_active_role` — set por `switchRole` server action y por el
   signup. Persistente.
3. Páginas compartidas (`/dashboard/eventos/[slug]`, `/dashboard/clubes/[slug]`)
   leen la cookie. Si no está, usan `fallbackPriority`:
   `["admin", "owner", "partner", "manager", "coach", "employee", "user"]`
   — roles privilegiados primero (después de un fix histórico, antes era
   user-first y degradaba el chrome).

**Bug histórico**: navegar a `/dashboard/partner/*` por URL **no** escribe la
cookie. Si después vas a `/dashboard/eventos/[slug]`, esa página lee la
cookie (que sigue siendo "user" o vacía) y muestra el sidebar del rol
viejo. La solución actual es el fallback priority — funciona para multi-
role pero un user puro va a ver chrome user.

## 4. `RoleSwitcher` (admin only)

Componente `src/components/dashboard/RoleSwitcher.tsx`. Visible solo si el
user tiene `role=admin` en `role_assignments`. Le permite **previewar
cualquier rol** sin tener las assignments — admin puede ver el dashboard
owner, partner, coach, etc para soporte.

Llamada: `switchRole({ role, clubId?, partnerId? })` (server action) → set
cookies `mp_active_role` y opcionalmente `mp_active_club_id`.

**Cuidado**: switch role **no** limpia suscripciones realtime de la pantalla
anterior (gap conocido — ver audit). Recargar la página al cambiar rol si
hay leak visible.

## 5. Sidebar items por rol

Definido en `MP_ROLES[role].sidebar` (`src/lib/roles.ts`). Cada rol tiene
sus grupos + items.

**Resumen** (items principales):

### user
Inicio · Clubes · Ranking · Eventos · Mensajes · Amigos · Shop · Coach AI
(MP+) · Academia · Mis clases · Mi perfil · MATCHPOINT+ · Mis membresías ·
Personalizar · Soporte · Solicitar Club

### admin
Overview · Clubes · Usuarios · Moderación · Pagos · Planes · Membresías ·
Bundles cosméticos · Patrocinadores · Eventos · Soporte · Quedadas · Métricas ·
Auditoría · Configuración · Roles · Team · Flags · Broadcast

### owner (club)
Reservas · Canchas · Clientes · Finanzas · Marketing · Configuración ·
Eventos · Staff

### manager
Reservas · Canchas · Clientes · Eventos · Staff · Walk-ins · Reportes

### partner
Ligas · Torneos · Brackets · Inscritos · Clubes (que usa) · Finanzas ·
Marketing

### coach
Clases · Alumnos · Calendario · Pagos · Recursos · Mi perfil

### employee
Check-in · Walk-ins · Caja · Reservas · Shop · Soporte

### Item global (todos los roles)
`Ayuda y guías` — appendado en `DashboardSidebar.tsx`, va a
`/dashboard/[role]/ayuda` (renderiza `HelpScreen` con contenido por rol).

## 6. Cobertura screens vs sidebar

Del audit per-role (snapshot actual):

| Rol | Items en sidebar | Pantallas reales | Cobertura |
|---|---|---|---|
| admin | 14 | 14 | 100% |
| user | 12 | 11+ | ~92% |
| owner | 9 | 8 | ~89% |
| manager / partner | 8 | 7 | 87.5% |
| coach | 7 | 6 | ~86% |
| employee | 8 | 6 | 75% |

Las que faltan caen a `RoleScreenStub` (placeholder honesto con mensaje
"sección en próxima iteración"). Ver `guides/04-placeholders.md` para la
lista exacta de qué falta.

## 7. Permisos clave (matriz cross-feature)

| Acción | user | partner | owner | manager | coach | employee | admin |
|---|---|---|---|---|---|---|---|
| Reservar cancha | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Confirmar reserva pending | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Crear torneo | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Editar torneo | ❌ | ✅ org propia | ✅ club propio | ❌ | ❌ | ❌ | ✅ |
| Cancelar torneo | ❌ | ✅ propio | ✅ propio | ❌ | ❌ | ❌ | ✅ |
| Marcar estelar | ❌ | ❌ ($20 paga) | ❌ | ❌ | ❌ | ❌ | ✅ |
| Aprobar comprobante | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Marcar pago onsite cobrado | ❌ | ✅ su torneo | ✅ su club | ✅ su club | ❌ | ❌ | ✅ |
| Crear clase | ❌ | ❌ | ✅ | ❌ | ✅ propia | ❌ | ✅ |
| Activar/revocar MATCHPOINT+ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Switch entre roles via UI | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

Esta matriz NO está auto-generada — actualizar a mano cuando agreguemos
features. Las RLS de DB son la fuente de verdad final (`architecture/30-rls.md`).

## 8. Helpers de auth en server actions

| Helper | Hace | Tira si |
|---|---|---|
| `requireUserId()` | Devuelve `auth.uid()` | No hay sesión |
| `requireAdminUserId()` | Devuelve uid si role=admin activo | No es admin |
| `requirePartnerAdmin(partnerId)` | Devuelve uid si owner/admin del partner_org | No es partner admin |
| `requireTournamentEditor(tournamentId)` | Admin global O partner_member del partner del torneo | No tiene autz para editar el torneo |

Todos viven en `src/server/actions/tournaments.ts` o
`src/lib/auth/session.ts`. **Usar siempre estos** en lugar de chequear roles
ad-hoc — centraliza la lógica.

## 9. Cosas que rompen seguido

1. **Asumir un rol "primario"** — los roles son multi. Un user puede ser
   user + partner + owner. Diseñar pensando en eso.
2. **Hardcodear sidebar item** — agregar al `MP_ROLES[role].sidebar` array,
   nunca al componente. El item "Ayuda" es la excepción (appendado en
   `DashboardSidebar.tsx`).
3. **Confiar en `session.activeRole`** sin chequear que el rol esté granted —
   en URLs `/dashboard/[role]/*`, layout valida explícitamente.
4. **Decir "es admin" sin chequear `revoked_at IS NULL`** — un role
   revocado sigue en la tabla.
5. **Crear feature para todos los roles** — la mayoría de features son
   role-specific (partner crea torneos, owner gestiona club, etc).
   Preguntarse: ¿qué rol(es) ven esto?

## 10. Cómo agregar un rol nuevo

1. SQL: agregar al enum `mp_role` (mig nueva).
2. TS: agregar `RoleKey` en `src/lib/roles.ts` + entry en `MP_ROLES`.
3. RLS: definir policies en `architecture/30-rls.md` y crear migration.
4. UI: si tiene panel, crear `src/components/dashboard/<rol>/` con sus
   screens. Registrar en `src/app/dashboard/[role]/[section]/page.tsx`
   `SCREENS` map.
5. Helper: si tiene permisos especiales, agregar `require<Rol>...` en
   `tournaments.ts` o módulo dedicado.
6. Sidebar: agregar grupos/items en `MP_ROLES[<rol>].sidebar`.
7. Help: agregar entry en `ROLE_HELP` de `HelpScreen.tsx`.
8. Doc: actualizar este archivo (catálogo + matriz de permisos).

## 10b. RBAC granular (capacidades) — mig 158

Además del modelo por RoleKey, existe una **matriz de capacidades real y editable**:

- Tablas `capabilities` (catálogo de 17 caps por dominio: Clubes/Usuarios/Pagos/
  Moderación/Sistema) y `role_capabilities` (rol × cap → nivel `all/limited/own/
  public/none`; ausencia = none). Sembrada con la matriz del diseño.
- **`admin` = todo, INMUTABLE**: `mp_role_can()` hardcodea `true` para admin (no se
  puede auto-bloquear); el editor rechaza editar admin.
- Helper SQL `mp_role_can(uid, cap, club?)` (SECURITY DEFINER) + helper TS
  `roleCan()` / `assertCapability(cap, { clubId })` en `src/lib/auth/capabilities.ts`.
- Edición: `AdminRolesView` → "Editar permisos" (admin) → action `updateRoleCapability`
  (admin-only, auditada vía `tg_audit_role_capabilities`).
- **Enforcement (por etapas):** Stage 1 ✅ = `assignRole`/`revokeRole` (owner)
  consultan `sys.roles`. Stage 2 ✅ = **UI del owner** (Personal del club →
  `AssignStaffModal`) para asignar/revocar manager/coach/empleado de su club, con
  **aceptación de términos** obligatoria (mig 159: `role_assignments.terms_version`
  + `platform_config.role_grant_terms*`); `revokeRole` simétrico (owner). Stage 3
  (en curso) = RLS de defensa en profundidad con patrón **aditivo**
  `mp_is_admin() OR (chequeo_rol_existente AND mp_role_can(uid, cap, club))` — sólo
  restringe, nunca amplía, admin intacto. Aplicado a `role_assignments` owner
  grant/revoke staff (mig 160, gate `sys.roles`); el resto de tablas se convierte
  on-demand con el mismo patrón (no reescribir las 95 políticas de golpe).
  Nivel `limited` ≈ permitido (refinamiento por-cap pendiente).
- **Términos de grant**: antes de que un owner asigne un rol de club, acepta los
  términos vigentes; se registra `terms_version` y el grant queda en el audit log
  (hash-chained). Solo admin se salta el gate de términos.

## 11. TODOs

- [x] UI para asignar roles a usuarios (admin) + matriz de permisos editable (mig 158)
- [ ] Limpieza de subs realtime al cambiar rol
- [ ] Cookie write al navegar via `/dashboard/[role]` (hoy solo lo escribe
      `switchRole`)
- [ ] Audit log al cambiar rol activo (hoy solo loguea grant/revoke)
