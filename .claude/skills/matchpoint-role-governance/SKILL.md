---
name: matchpoint-role-governance
description: Checklist profunda de gobernanza por roles en MatchPoint v2. Úsala cuando agregues o cambies un RoleKey, un permiso/capacidad, una superficie de administración, un item de sidebar, o cuando una feature necesite un "path admin" para listar/inspeccionar/pausar. Garantiza que (1) ninguna feature quede "ingobernada" (sin forma de que admin/owner la gestione sin abrir Supabase Studio) y (2) un rol/permiso nuevo quede 100% cableado en todas sus superficies (MP_ROLES, guard del layout, RoleSwitcher, AdminRolesScreen, RLS, audit). Complementa matchpoint-feature-plan (plan amplio) y matchpoint-logic-review (complementos de RoleKey) — esta es la checklist específica de la dimensión roles.
---

# MatchPoint Role Governance

Los 7 roles de MatchPoint (`RoleKey` en `src/lib/roles.ts`): `user`, `admin`,
`owner`, `manager`, `partner`, `coach`, `employee`. Una feature o un rol nuevo
toca varias superficies de gobernanza; si saltás una, el rol existe en DB pero
no aparece en la UI, o la feature funciona pero nadie del staff puede
gestionarla. Esta skill recorre esas superficies.

> Antes de proponer fixes de RLS/roles, releé `docs/guides/00-roles.md` y
> `docs/architecture/30-rls.md §9` (vía `matchpoint-docs-guide`).

## Regla 0 — Ninguna feature "ingobernada"

Para CUALQUIER feature con estado que el negocio pueda querer cambiar:
**¿cómo lo lista / inspecciona / edita / pausa el staff sin abrir Supabase
Studio en producción?** Si la respuesta es "se gestiona en código", verificá
dos veces que sea genuinamente estático (un enum/catálogo curado). Si tiene
estado dinámico (precios, flags, activación, destacados, grants), necesita:

- Estado en DB (no hardcodeado).
- Server action admin/owner con `requireAdminUserId()` (o equivalente del rol) +
  `setAuditActor(admin, callerId, role)` antes de mutar con service-role.
- Una **pantalla** donde el rol correcto lo opere (existente o nueva).

Ejemplos ya en el repo: `AdminCosmeticsScreen` (grants + activar/desactivar
temas), `AdminFlagsScreen` (feature flags), `AdminPlansScreen` (premium),
`platform_config` (take rate, precio estelar).

## Checklist A — RoleKey nuevo (cableado completo)

Un rol nuevo no es solo una fila en `role_assignments`. Recorré:

- [ ] `RoleKey` union en `src/lib/roles.ts`.
- [ ] Entry en `MP_ROLES` (label `l`, `color`, `icon`, `badge`, `desc`, `ctx`,
  `sidebar` con sus grupos/items).
- [ ] `MP_ROLE_ORDER` (orden en el switcher).
- [ ] `MP_ROLE_SCREENS` (qué `[section]` keys son válidas para el rol) +
  `mpRoleScreenExists` lo refleja.
- [ ] Guard en `src/app/dashboard/[role]/layout.tsx`: valida `role_assignments`
  (no revocado), redirige a un rol que SÍ tenga si no aplica (no 403 sin salida),
  resuelve `clubId`/`partnerId` si el rol es tenant-scoped.
- [ ] `RoleSwitcher` lo muestra.
- [ ] `AdminRolesScreen` lo documenta como rol operable.
- [ ] CTA principal del rol en `TopBar` (`CTA_BY_ROLE` si aplica).
- [ ] RLS: políticas que usan `auth.active_role()` / `auth.has_club_access()`
  contemplan el rol nuevo.

Síntoma de gap: el rol existe en DB pero el sidebar no aparece, o el layout
redirige en loop, o el switcher no lo lista.

## Checklist B — Permiso/capacidad nueva

- [ ] **Gating server**: la action valida el rol/permiso (no confiar solo en la
  UI; un permiso solo-UI se bypassa por API directo).
- [ ] **RLS**: la tabla afectada permite la mutación al rol correcto, o se usa
  `getAdminClient` post-validación + `setAuditActor`.
- [ ] **Catálogo**: `AdminRolesScreen` refleja el permiso nuevo (catálogo
  operativo desactualizado = soporte no sabe quién puede qué).
- [ ] **Scope**: ¿es global (admin) o por tenant (owner/manager de SU club,
  partner de SU partner)? La RLS debe acotar al scope.

## Checklist C — Matriz de visibilidad cross-rol

Para cada dato nuevo, mapeá quién lo ve y bajo qué condición. Gaps típicos:

- Rol tenant-scoped (owner/manager/employee) que ve data de OTRO tenant → RLS leak.
- Admin que "ve todo" pero la RLS de admin no fue agregada a la tabla nueva → no
  ve un sub-tenant.
- `coach` o `partner` con acceso a una pantalla pero a un subset que no debería.
- Dato sensible (phone, birthdate, pagos) expuesto a roles que solo deberían ver
  campos públicos (ojo con `select *` en tabla raw vs vista pública).

Bullets de salida: 🔓 público · 🔐 gated por rol/permiso (condición exacta) ·
🚩 detrás de flag · 🔒 server-only.

## Checklist D — Sidebar item nuevo

- [ ] Agregado a `MP_ROLES[role].sidebar` (grupo + item con `k`, `label`, `icon`).
- [ ] La ruta resuelve: `/dashboard/[role]/[section]` con `[section] === k`, y
  `mpRoleScreenExists(role, k)` es true.
- [ ] El componente de pantalla existe y el `[section]/page.tsx` lo mapea.
- [ ] Si la página necesita el chrome (sidebar/topbar/guard), vive bajo
  `[role]/` (no en un path estático que saltee el layout dinámico).

## Checklist E — Audit

Cualquier acción donde un rol muta data **ajena** (admin/owner sobre otro user,
sobre otro tenant) debe llamar `setAuditActor(client, callerId, role)` antes de
mutar con service-role, o el audit queda con `actor=null, role=system`.

## Output

| # | Gap | Superficie | Fix sugerido (archivo:línea) |
|---|---|---|---|
| 1 | Rol `x` sin entry en MP_ROLES | sidebar no aparece | `src/lib/roles.ts` MP_ROLES |
| 2 | Feature sin path admin | soporte abre Studio | nueva sección en `Admin*Screen` |

Luego: ¿aplico los fixes?

## Cuándo NO usar esta skill

- Feature que no toca roles/permisos/admin (ej. fix visual, copy).
- El plan amplio ya lo cubre y solo es 1 rol existente sin cambios de gobernanza.

## Orquestación

- `matchpoint-feature-plan` → plan amplio (governance es 1 paso); esta skill es
  la checklist profunda de ese paso.
- `matchpoint-logic-review` → "complementos" de RoleKey (parte del review post-impl).
- `matchpoint-docs-guide` → leer `00-roles.md` + `30-rls.md §9` antes de fixear.
