---
name: matchpoint-feature-plan
description: Planea la implementación de una feature nueva en MatchPoint v2 ANTES de escribir código, recorriendo todas las capas backend (schema, RLS, realtime, server actions, audit, notif, OpenAPI, platform config) y frontend (server component, client, responsive, sync cross-surface). Úsala cuando el usuario expresa intención de agregar/cambiar una feature ("quiero agregar X", "implementemos Y", "qué hace falta para Z", "vamos con la siguiente fase"). Complementa `matchpoint-docs-guide` (esa skill te dice qué LEER; esta te dice qué CONSTRUIR). Produce un plan tailored al feature: lista exhaustiva de archivos a tocar, errores a registrar, notifs a disparar, docs a actualizar, sincronías cross-surface a respetar. No empezar a codear hasta que el plan esté aceptado.
---

# MatchPoint Feature Plan

Skill para planear la implementación de una feature ANTES de tocar código. Garantiza que ningún ítem del checklist `docs/guides/07-new-feature-checklist.md` quede sin discutir.

## Por qué existe

MatchPoint tiene **N superficies por feature**: server action + RLS + realtime publication + audit + notif + OpenAPI + UI + sync cross-surface + docs. Si saltás una, el feature parece funcionar pero la sincronía muere en silencio. Esta skill obliga a recorrer todas las capas en orden y producir un plan concreto.

`matchpoint-docs-guide` cubre "qué LEER antes". Esta skill cubre "qué CONSTRUIR".

## Cuándo se dispara

Cualquier expresión de intención de cambio que toque más de una capa:

- "Voy a agregar [feature]"
- "Implementemos [X]"
- "Qué hace falta para [Y]"
- "Empecemos [Z]"
- "Vamos con la siguiente fase de [feature]"
- "Cuál es la mejor forma de hacer [comportamiento]"
- "Cambiemos el flujo de [proceso]"

NO se dispara para:

- Bug fixes visuales puntuales (color, spacing, copy).
- Rename de variable interna.
- Reformat de archivo existente.

## Cómo aplicarla

### Paso 1 — Resumir el feature en una frase

Antes de cualquier análisis, repetir al usuario lo que entendiste:

> "El feature es: [verbo] [objeto] cuando [trigger], visible en [superficies], gated por [permiso]."

Si la frase tiene >2 ambigüedades, pedir clarificación con `AskUserQuestion`. No avanzar a Paso 2 hasta tener una frase precisa.

### Paso 2 — Mapear capas tocadas

Recorrer el checklist `docs/guides/07-new-feature-checklist.md` y marcar cada capa con uno de:

- ✅ **Sí toca** — describir qué cambio concreto
- ❌ **No toca** — saltar
- ❓ **Posiblemente** — flag para discutir

Capas a recorrer en orden:

1. **Schema** — ¿nueva tabla, columna, enum, índice, trigger?
2. **RLS** — ¿qué rol ve/muta? ¿se necesita `getAdminClient` post-validación o RPC SECURITY DEFINER?
3. **Realtime** — ¿alguien escucha esto en vivo? ¿con qué filter? ¿debounce?
4. **Server actions** — ¿qué actions nuevas o modificadas? validación Zod, error codes, return shape.
5. **Audit log** — ¿es admin/owner mutando data ajena? `setAuditActor` requerido.
6. **Notificaciones** — ¿hay humano que recibe notif? kind, dispatcher, preferences.
7. **OpenAPI** — actions nuevas se autogeneran si schemas se exportan.
8. **Platform config** — ¿hay parámetro de negocio que pueda cambiar sin redeploy?
9. **Admin governance** — ¿cómo lista/inspecciona/edita/pausa admin esta feature? Pantalla candidata (existente o nueva). Si la respuesta es "no necesita", verificar dos veces — features sin path admin son anti-pattern en MatchPoint.
10. **Feature flag** — ¿necesita rollout gradual o killswitch? Si sí, key + default + dónde guardea en `feature_flags`. Si no, justificar.
11. **Roles y permisos** — ¿se introduce permiso/rol nuevo? ¿cambian sidebar items en `src/lib/roles.ts` (`MP_ROLES`)? ¿afecta `AdminRolesScreen` (catálogo operativo)?
12. **Server component** — ¿qué queries fetchea? `Promise.all`, React.cache, `getProfileSummary`.
13. **Client component** — interactividad, `useTransition`, toast, status helpers.
14. **Responsive** — ¿Tailwind responsive vs inline tokens? mobile verify.
14.b **Animaciones / polish UI** — ¿la feature introduce transiciones (modals, drawers, toasts, hover states, entrada/salida de elementos)? Si sí, **invocar la skill `emil-design-eng`** durante la implementación para aplicar:
   - Easing curves correctos (`--ease-out`, `--ease-drawer`).
   - Duración correcta (150-250ms para popovers, 200-500ms para drawers).
   - `transform-origin` desde el trigger (no center) para popovers.
   - `scale(0.95)` mínimo de entrada (nunca scale(0)).
   - `transform: scale(0.97)` en `:active` de botones para feedback.
   - `prefers-reduced-motion` respetado.
15. **Sync cross-surface** — listar TODAS las pantallas que muestran la data afectada.
16. **Placeholders / WIP** — ¿quedaste con algo a medias intencional? Registrar archivo:línea + qué falta en `docs/guides/04-placeholders.md`. NUNCA dejar stub silencioso.
17. **Privacy** — ¿data personal nueva? ¿cambia quién la ve? retención.
18. **Docs** — siempre actualizar al menos uno de architecture/, product/, guides/.

### Paso 3 — Identificar superficies cross-surface

Para CADA mutación del feature, listar:

| Quién muta | Qué pantallas reflejan el cambio | Cómo se sincroniza |
|---|---|---|
| ej. partner cancela torneo | `/eventos`, dashboard user widget, partner panel, admin events | realtime con filter por partner_id + notif a inscritos + audit |

Si una superficie queda sin sincronizar, registrar como **gap** y discutir solución antes de codear.

### Paso 3.b — Matriz de visibilidad (rol × permiso × flag)

Para cada **dato nuevo** del feature, mapear quién lo ve y bajo qué condición. Esta matriz expone gaps que la lista de superficies (Paso 3.a) no captura — ej. un rol que ve la pantalla pero NO debería ver cierto subset del data.

| Dato | Pantalla | Rol que lo ve | Permiso requerido | Feature flag | Notas |
|---|---|---|---|---|---|
| ej. team roster | `/dashboard/user/team` | user (miembro) | ser miembro del team | — | público dentro del team |
| ej. team roster | `/dashboard/admin/admin-users` | admin | role=admin | `admin_view_teams` | full visibility cross-tenant |
| ej. team rename count | (interno) | server only | — | — | NO se expone al cliente |
| ej. captain plan_tier | UI gating badge "12/12" | user (captain) | propio user | — | derivado de `isPlanActive` |

**Reglas de la matriz**:

- **Rol**: listar todos los `RoleKey` afectados (`user`, `admin`, `owner`, `manager`, `partner`, `coach`, `employee`). Si la celda dice "todos" es porque la data es pública. Si dice "ninguno cliente", es server-only.
- **Permiso**: condición runtime que el rol debe cumplir (ser captain, ser miembro, ser dueño del recurso). Si solo el rol basta, escribir "—".
- **Feature flag**: si el feature está detrás de un flag (`feature_flags` tabla, ver `AdminFlagsScreen`), nombrarlo. Si todavía no existe, **proponer crearlo**. Default: si la feature es WIP/beta, gate detrás de flag para poder rollear gradual.
- **Notas**: edge cases (data sensible que el rol ve solo de su scope, data global que solo admin ve, etc).

**Cómo decidir si necesita flag**:

- Sí: feature es beta, requiere rollout gradual, A/B test, o killswitch en producción.
- No: feature es small + reversible (puede revertirse via revert del PR sin user impact).

**Gaps típicos a flagear**:

- Pantalla muestra data del rol X pero el dato pertenece a rol Y → RLS leak.
- Permiso runtime no validado en el server (solo en UI) → bypass via API directo.
- Flag activado pero el dato sigue visible porque la query no lo filtra.
- Admin que "ve todo" en realidad no ve un sub-tenant porque la RLS de admin no fue agregada.

Después de la matriz, listar en bullet:

- 🔓 Datos que cualquier user logueado ve sin restricción.
- 🔐 Datos gated por rol/permiso (qué condición exacta).
- 🚩 Datos detrás de feature flag (qué flag + estado default).
- 🔒 Datos server-only (nunca al cliente).

### Paso 4 — Listar archivos concretos

Output del plan: lista de archivos exactos a crear/modificar.

Ejemplo para "Roster cap por plan en teams":

```
NEW   supabase/migrations/102_team_rename_count.sql
NEW   src/lib/teams/caps.ts
EDIT  src/lib/api/errors.ts                  (+TEAMS.ROSTER_LIMIT_REACHED, +TEAMS.ALREADY_CAPTAIN, etc)
EDIT  src/server/actions/teams.ts            (validar caps en 5 actions)
EDIT  src/components/dashboard/user/TeamScreenView.tsx  (badge 12/12 + banner upgrade)
EDIT  docs/product/00-matchpoint-plus.md     (sacar "nada gated", agregar Teams)
EDIT  docs/architecture/20-database.md       (§29 add rename_count)
```

Marcar cada archivo con NEW / EDIT y un breve "qué cambia".

### Paso 5 — Stage el trabajo

Dividir en stages cuando >5 archivos o >2h estimadas:

- **Stage 1 (esencial)**: backend que rompe en silencio si falta (schema, RLS, errors, validación).
- **Stage 2 (visible)**: UI, badges, banners.
- **Stage 3 (opcional)**: refinos, notifs no-críticas.

Cada stage debe poder mergearse independiente y dejar el sistema en estado funcional (no half-broken state).

### Paso 6 — Definition of done por stage

Antes de marcar un stage completo, verificar el checklist §5 de `07-new-feature-checklist.md`:

- TypeScript limpio
- Lint limpio
- agent-browser smoke test
- Edge cases (empty, max, error, unauth)
- Migration aplicada al remote
- Docs actualizadas
- **Si el stage tocó UI**: invocar `matchpoint-ui-review` para el QA visual
  (botones que se rompen con labels largos, hover sin gate, `.btn` +
  inline overrides, text overflow sin ellipsis, animaciones Emil-compliant).
- **Para CUALQUIER feature con 3+ archivos tocados**: invocar
  `matchpoint-logic-review` para coherencia funcional cross-cutting
  (entidad searchable pero no visitable, action key ↔ schema mismatch,
  RLS sin bypass, triggers vs downstream queries, casos especiales
  como is_system manejados en una superficie y olvidados en otra).

### Paso 7 — Presentar y confirmar

Output final al usuario:

```
## Plan: <feature>

### Lo que entiendo
<frase de Paso 1>

### Capas tocadas
<lista de Paso 2 con ✅/❌/❓>

### Sync cross-surface
<tabla de Paso 3.a — quién muta, qué pantallas reflejan, cómo se sincroniza>

### Matriz de visibilidad (rol × permiso × flag)
<tabla de Paso 3.b — dato, pantalla, rol, permiso, flag, notas>
<bullets 🔓/🔐/🚩/🔒>

### Admin governance
- Pantalla(s) admin afectada(s): <existente o nueva>
- Capacidades para admin: listar / inspeccionar / forzar / pausar
- Permisos/roles nuevos a registrar en `AdminRolesScreen`: <sí/no — qué>
- Sidebar items a agregar en `src/lib/roles.ts`: <sí/no — qué rol/item>

### Feature flag
- ¿Necesita flag? <sí/no + razón>
- Key: <nombre_snake>
- Default: <true/false + razón>
- Dónde se evalúa: <server actions, UI guards>

### Placeholders / WIP
- <archivo:línea> — <qué falta + cuándo se planea>
(o "ninguno" si la feature queda 100% funcional)

### Archivos
<lista de Paso 4>

### Stages
<división de Paso 5>

### Riesgos y questions abiertas
<lo que sigue ambiguo o requiere decisión>

¿Procedo con Stage 1 o discutimos?
```

NO escribir código hasta que el usuario confirme.

## Cosas a evitar

- **Saltar Paso 1**: "ya entiendo lo que querés" sin repetir la frase = malentendidos garantizados.
- **Listar archivos sin tocar las capas en orden**: te perdés notifs, audit, realtime publication.
- **Empezar a codear "mientras consultas"**: una vez escrito, es más caro deshacer.
- **No mapear sync cross-surface**: el feature funciona aislado pero rompe las otras pantallas en silencio.
- **Stages que dejan medio-roto**: cada stage debe poder mergearse independiente. Si Stage 1 introduce error_code sin handler en UI, eso es half-broken.

## Anti-patrones que la skill debe detectar

| Síntoma en la propuesta | Bandera roja |
|---|---|
| "Realtime sin filter" en una tabla hot | Detener — propondrá fanout a todos los clientes |
| "Server action sin runAction wrapper" | Detener — falta validación + error shape |
| "Mutación admin sin setAuditActor" | Detener — audit queda con actor=null |
| "Hardcoded price/percentage" | Sugerir platform_config |
| "1 superficie afectada" en una mutación cross-tenant | Verificar — probable que falte mapear |
| "Sin notif" cuando un humano debe enterarse | Sugerir notif kind nueva |
| "Sin migration" con cambio de schema | Detener — no se puede aplicar |
| Feature sin path admin para listar/editar/pausar | Detener — soporte va a abrir Supabase Studio en producción |
| Sidebar item nuevo sin actualizar `MP_ROLES` en `src/lib/roles.ts` | Detener — el item no va a aparecer |
| Permiso/rol nuevo sin reflejar en `AdminRolesScreen` | Sugerir — catálogo desactualizado |
| Stub UI silencioso (botón que no hace nada) sin badge "Pronto" | Detener — convertir a placeholder honesto o quitar |
| Feature beta sin feature flag | Sugerir — sin flag, killswitch significa hotfix + deploy |
| Hardcoded magic numbers (caps, prices, thresholds) | Sugerir `platform_config` |
| Feature con animación nueva (modal/drawer/toast/transition) sin pasar por `emil-design-eng` | Detener — la skill de Emil tiene las reglas (easing, duración, transform-origin, scale mínimo) |
| `transform: scale(0)` o `ease-in` en UI | Detener — Emil flagea como antipatrón |

## Cuando NO usar esta skill

- El usuario ya pegó el plan y solo pide implementar lo discutido.
- El cambio es <30 min y toca 1 archivo (typo, color, alineación).
- Es debugging puro (entender un error existente sin agregar nada).

En esos casos, ir directo al cambio. La skill es para PLANEAR features, no para ejecutar fixes triviales.

## Output esperado

El usuario debe poder leer el plan y responder en una de 3 formas:

1. ✅ "Voy" → ejecutar Stage 1.
2. 🛑 "Cambiemos X" → ajustar plan + reconfirmar.
3. ❓ "Por qué Y" → explicar la decisión sin re-empezar el plan.

Si la respuesta es ambigua, pedir clarificación con `AskUserQuestion`.
