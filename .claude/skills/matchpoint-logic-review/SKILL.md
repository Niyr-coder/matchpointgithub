---
name: matchpoint-logic-review
description: Revisa coherencia lógica cross-cutting de una feature recién implementada en MatchPoint v2. Cubre 6 dimensiones — (1) entidades searchable/visitable/editable, (2) casos especiales (is_system, archived, soft-deleted) en todas las superficies, (3) action key ↔ Zod schema match, (4) RLS ↔ SECURITY DEFINER bypass, (5) trigger ↔ downstream queries, (6) **wire integrity** (eventos sin handler, props pasadas y no consumidas, data fetcheada y no renderizada), (7) **lógica de redirección** (post-creación, post-edit, auth gate, permission gate, notif click → href), (8) **complementos** (notification_kind nuevo necesita iconForKind/hrefForKind; conversations.kind nuevo necesita ConvoLite + query filters; RoleKey nuevo necesita MP_ROLES + RoleSwitcher; nuevo status necesita helper map; feature MP+ gated necesita banner + isPlanActive + error code específico). Úsala DESPUÉS de implementar y ANTES del commit final, o cuando aparece un bug funcional "estructural". Complementa `matchpoint-ui-review` (visual) y `emil-design-eng` (animación) — esta cubre la coherencia funcional del sistema. Output: lista de gaps con archivo:línea + fix sugerido.
---

# MatchPoint Logic Review

Skill de coherencia lógica post-implementación. Atrapa los bugs estructurales que **funcionan en aislamiento pero rompen el contrato del sistema** cuando otras superficies asumen algo distinto.

## Ejemplos reales que motivaron esta skill

1. **MATCHPOINT searchable pero no visitable**: la búsqueda en `/amigos descubrir` retornaba el perfil oficial, pero `/dashboard/players/[username]` 404 para `is_system`. El user llegaba a un dead end. Gap detectable: "si X aparece en search, X debería tener vista".

2. **SendFriendRequest key mismatch**: el componente pasaba `{ userId }` pero el schema Zod esperaba `{ toUserId }`. TS no atrapaba porque server actions reciben `unknown`. Toast "Invalid input" en producción. Gap detectable: "para cada call a action, las keys del payload deben matchear el schema".

3. **fn_send_system_message necesita SECURITY DEFINER** porque `messages_member_insert` requiere `sender_id = auth.uid()`. Sin SECURITY DEFINER, el bot no podía enviar nunca. Gap detectable: "si A se ejecuta como rol de sistema pero la RLS lo bloquea, A necesita bypass explícito".

4. **Trigger creates row pero downstream query no lo incluye**: si un trigger autocrea un team_channel, pero la query del MensajesScreen filtra solo `kind=dm`, el team_channel no aparece. Gap detectable: "trigger inserta en tabla X kind Y; ¿qué queries existentes filtran por kind y deben incluir Y?".

## Cuándo se dispara

DESPUÉS de implementar una feature o detectar un bug que "funciona en una pantalla pero falla en otra". También antes del commit final de un stage.

NO se dispara para:

- Bug puramente visual (alineación, color) → `matchpoint-ui-review`.
- Decisión de animación o easing → `emil-design-eng`.
- Migrations SQL aisladas sin consumers.

## Cómo aplicarla

### Paso 0 — Apoyarse en otras skills (orquestación)

Esta skill **no opera aislada**. Antes y durante la review, delegar a las
otras skills del proyecto cuando los hallazgos caigan en su dominio. La
delegación es activa: invocar la skill correspondiente vía el `Skill` tool.

| Skill | Cuándo invocarla desde esta |
|---|---|
| `matchpoint-docs-guide` | Cuando el gap involucra una capa documentada (RLS, realtime, payments, premium, notifs, roles). **Antes de proponer un fix**, releer la sección relevante. |
| `matchpoint-feature-plan` | Cuando los gaps son tantos que la feature **necesita re-planearse**, o cuando detectás que la matriz de visibilidad rol/permiso/flag está incompleta. |
| `matchpoint-ui-review` | Cuando un gap de wire/redirect tiene componente visual (botón roto, hover sin gate, label sin truncate). Delegar para que aplique el checklist visual + agent-browser. |
| `emil-design-eng` | Cuando el gap involucra animación nueva (transición de entrada/salida en modal/drawer/popover, hover/active states, easing). Para principios de motion. |

**Patrón de uso típico** (no rígido):

1. Identificar el gap con esta skill.
2. Si el gap toca otra capa, invocar la skill especializada con un prompt
   compacto: *"Vengo de matchpoint-logic-review. Encontré que X. ¿Qué dice
   la doc/Emil/UI sobre esto?"*.
3. Aplicar el fix combinando ambas perspectivas.
4. Verificar con `npx tsc --noEmit` antes de cerrar.

**Anti-patrón a evitar**: hacer todo desde esta skill ignorando que las
otras tienen conocimiento más profundo del dominio. Ej: encontrar un
botón sin `:active feedback` → no sugerir el fix de memoria, invocar
`emil-design-eng` o `matchpoint-ui-review` para el valor exacto y razón.

### Paso 1 — Listar superficies de la feature

Para la feature recién tocada, listar EXPLÍCITAMENTE:

- **Entidades nuevas o modificadas**: tablas, kinds, status enums, role keys.
- **Operaciones sobre cada entidad**: crear / buscar / listar / visitar / editar / borrar / archivar.
- **Roles/personas que las disparan**: user / admin / owner / partner / coach / system.
- **Estados especiales que importan**: `is_system`, `is_archived`, `is_deleted`, `expired`, `pending`, `cancelled`.

Output: matriz mental "entidad × operación × actor".

### Paso 2 — Coherencia de operaciones (la columna entera)

Para cada entidad, recorrer el **ciclo completo** y verificar que esté soportado en todas las superficies relevantes:

- **Buscar X** → debe poder **visitar X**.
- **Visitar X** → debe haber un **action posible** (chat / amigo / contratar / etc) o explicar por qué no.
- **Crear X** → debe haber **lista de X** que lo refleje.
- **Editar X** → debe propagar a **realtime / cache / superficies cross**.
- **Borrar X** → ¿qué pasa con referencias colgantes en otras tablas? FK cascade? Soft-delete?

Para cada gap, pregunta: **"esta operación está prometida en una pantalla pero rota en otra?"**.

### Paso 3 — Casos especiales (la fila completa)

Para cada estado especial (`is_system`, `is_archived`, etc), recorrer **toda la columna de operaciones** y verificar:

- ¿Cada operación maneja este caso o lo ignora?
- ¿Si lo ignora, el ignore es **intencional** (UI lo bloquea antes) o **bug** (UI no sabe que debería bloquear)?

**Tabla de check** (ejemplo para `is_system`):

| Operación | Comportamiento esperado | Implementación actual | Gap? |
|---|---|---|---|
| Search | aparece con badge verified | sí (mig 111) | ✅ |
| Visit profile | vista compacta oficial | sí (OfficialAccountView) | ✅ |
| Send friend request | auto-accept | sí (trigger 111) | ✅ |
| Receive DM | sí | sí (welcome hooks) | ✅ |
| Send DM | bloqueado | sí (RLS 111) | ✅ |
| Aparece en ranking | NO | sí (mig 107 RLS RESTRICTIVE) | ✅ |
| Aparece en player_stats | NO | sí (mig 107) | ✅ |
| Aparece como captain del team | imposible | depende — no hay trigger guard, pero no hay flow para crear team como system | ⚠️ |

Cada `⚠️` queda registrado en `04-placeholders.md` o se fixea.

### Paso 4 — Action call ↔ Schema match

Para CADA llamada a server action en el archivo bajo review:

```ts
const r = await someAction({ key1, key2, key3 });
```

1. Encontrar el schema Zod del action (ej. `SomeActionSchema` en `src/lib/schemas/`).
2. Comparar las keys del schema con las del payload.
3. Si difieren, fixear ANTES de commit.

TS no atrapa esto porque las server actions reciben `unknown`. Es un bug en runtime ("Invalid input") garantizado.

Tip: en el server, `runAction(SchemaName, input, async ({ keyA, keyB }) => ...)` — las keys destructuradas son la fuente de verdad.

### Paso 5 — RLS ↔ SECURITY DEFINER coherence

Para cada nueva acción server-side que escribe a una tabla con RLS:

1. ¿La RLS permite el insert/update con el `sender_id`/`actor` esperado?
2. Si NO, ¿se usa `getAdminClient` (service role bypass) o una RPC SECURITY DEFINER?
3. Si se usa service role, ¿se llamó `setAuditActor` antes para que el audit no quede con `actor=null`?

Frecuente: acción del sistema (cron, trigger, broadcast) que se ejecuta como rol "system" pero la RLS está pensada para user JWT.

> **Delegar**: si hay duda sobre patrones de RLS o cuándo usar admin client,
> invocar `matchpoint-docs-guide` → leer `docs/architecture/30-rls.md §9`
> (helpers `setAuditActor`, patrones post-MVP).

### Paso 6 — Trigger ↔ Downstream queries

Para cada trigger nuevo que inserta en una tabla:

1. ¿Qué queries existentes leen esa tabla?
2. ¿Filtran por algún `kind`/`status`/`type` que excluya el row recién insertado?
3. Si sí, ¿es intencional o bug?

Ejemplo: trigger crea `conversation kind=team_channel`. ¿La query de MensajesScreen filtra `kind in (...)` y omite `team_channel`? Si sí, los teams chats no aparecen aunque existan en DB.

### Paso 7 — Migration ↔ Code drift

Para cada migration aplicada:

1. ¿El código TS conoce las nuevas columnas/funciones?
2. ¿Los `Database` types fueron regenerados? Si no, hay `as never` casts proliferando.
3. ¿La doc `architecture/20-database.md §29` refleja la migration?
4. ¿La migration tiene archivo local committed? (común olvidar: aplicado vía MCP pero sin file en `supabase/migrations/`).

### Paso 8 — Wire integrity (lo que renderiza realmente hace algo)

Cada elemento interactivo debe tener un consumer real. Tres sub-checks
que atrapan "se ve bonito pero no hace nada":

#### 8.1 — Eventos sin handler / handlers que no hacen nada

Para cada `<button>`, `<form>`, `<Link>`, `<input>` en el archivo bajo
review:

```bash
grep -nE '<button[^>]*>|<form[^>]*>|onClick=|onSubmit=' <archivo>
```

Verificar:
- [ ] Cada `<button>` tiene `onClick` o está dentro de un `<form>` con
  `onSubmit`. Botones sin handler son anti-patrón visible.
- [ ] Cada `onClick`/`onSubmit` invoca algo real (server action, navegación,
  state update). Si es `onClick={() => {}}` o `onClick={() => toast(...)}`
  sin lógica de negocio, marcarlo como placeholder explícito o quitarlo.
- [ ] Inputs con `value` controlado tienen `onChange` que actualiza el
  state correspondiente.
- [ ] Forms con campos requeridos validan ANTES de enviar (no solo en
  server). Sino el user ve un toast "Invalid input" sin contexto.

> **Delegar**: si encontrás botón sin `:active` feedback, sin transición
> de hover correcta, o con label largo que rompe layout, invocar
> `matchpoint-ui-review` para el fix exacto. Si la animación de entrada
> del componente no respeta easing/duración Emil, invocar `emil-design-eng`.

#### 8.2 — Props pasadas pero no consumidas (o vice versa)

Para componentes nuevos o modificados con props nuevas:

1. Listar props del component signature.
2. Buscar cada prop en el body del componente.
3. Si una prop no se usa → eliminarla o documentar por qué se pasa.
4. Inversamente: si el component lee `data.X` pero el caller no pasa `X`,
   es un undefined runtime.

```bash
# props declaradas
grep -nE 'function \w+\({[^}]*}|: \{[^}]+\}' <archivo>
# props consumidas en el body
grep -n '<prop>' <archivo>
```

#### 8.3 — Data fetched pero no renderizada

Si una server action / page.tsx fetchea data pero ninguna parte del view
la muestra, es código muerto + query desperdiciada.

Para cada `await supabase.from(...)` en server components:
- ¿Algún descendant renderiza la data?
- ¿Algún consumer hace algo con ese campo?
- Si la fetcheas "por las dudas", quitarla (`.limit()` defensivo cuenta
  como uso legítimo).

### Paso 9 — Lógica de redirección

Cada flujo que termina con success/cancel debe ir a algún lado correcto:

- [ ] **Post-creación**: después de crear X exitoso, ¿el user va al
  detalle de X, o queda en el form con estado "creado"? Convención
  MatchPoint: redirect a detalle (`/dashboard/<role>/<section>/<id>`).
- [ ] **Post-edit**: igual — redirect a la lista o al detalle actualizado.
- [ ] **Cancel/Back**: ¿vuelve a donde el user estaba antes? (No `router.back()`
  ciego — si llegó por deep link, `back()` lo saca de la app).
- [ ] **Auth gate**: rutas protegidas redirigen a `/?auth=signin&next=<url>`
  para que después del login el user regrese.
- [ ] **Permission gate**: si rol equivocado, redirect al dashboard del
  rol que SÍ tiene (priority fallback). No 403 sin salida.
- [ ] **Self-redirect en perfiles**: `/dashboard/players/[username]` para el
  propio user redirige a `/dashboard/user/perfil` (versión editable). El
  caso simétrico también: si admin abre su propio perfil desde
  `AdminUsersScreen`, ¿va a edit o a view? Decidir y consistente.
- [ ] **Notif click**: cada `kind` de notificación tiene un `hrefForKind`
  mapeado en `NotificationsPanel.tsx`. Sin eso, click en notif no hace
  nada → user frustrado.

Anti-patrón típico: server action retorna `{ ok: true, data: { id } }` pero
el caller no hace nada con `id` → el user se queda viendo el form vacío
preguntándose si funcionó.

### Paso 10 — Complementos (nuevo X requiere actualizar Y, Z, W)

Cuando se agrega una **entidad nueva** (kind, role, status, tabla, feature),
hay un set de surfaces "complementarias" que normalmente deben actualizarse.
Esta es la fuente N°1 de bugs invisibles porque cada surface es opcional
en aislamiento pero esperado en agregado.

Para cada tipo de entidad nueva, recorrer el checklist correspondiente:

#### Nueva `notification_kind`:

- [ ] `iconForKind` en `NotificationsPanel.tsx` mapea el kind a icon.
- [ ] `colorForKind` mapea a color.
- [ ] `hrefForKind` mapea a URL clickable.
- [ ] Default channels en `notification_kinds` row (inapp/email/push).
- [ ] Si se requiere preferencia user-tunable, agregar a settings UI.

> **Delegar**: invocar `matchpoint-docs-guide` para releer
> `docs/guides/02-notifications.md` antes de proponer el dispatcher.

#### Nuevo `kind` en `conversations` (ej. team_channel):

- [ ] `conversations_kind_check` constraint extendido.
- [ ] `MensajesScreen` queries no filtran el kind sin querer.
- [ ] `ConvoLite` type incluye el kind nuevo.
- [ ] Avatar/icon distintivo en MensajesScreenView para el kind.
- [ ] Hint/copy específico si el kind tiene reglas (read-only, broadcast, etc).

#### Nuevo `RoleKey`:

- [ ] `MP_ROLES` en `src/lib/roles.ts` con sidebar config.
- [ ] Layout `/dashboard/[role]/layout.tsx` reconoce el rol y valida
  `role_assignments`.
- [ ] `RoleSwitcher` muestra el rol nuevo.
- [ ] `AdminRolesScreen` lo documenta como permiso operable.
- [ ] Color + badge label en `MP_ROLES[role]`.
- [ ] `TopBar` `CTA_BY_ROLE` define el botón principal.

> **Delegar**: invocar `matchpoint-docs-guide` para releer
> `docs/guides/00-roles.md` antes de cerrar — la matriz operativa de
> permisos vive ahí.

#### Nuevo status enum (ej. tournament.status, transaction.status):

- [ ] Todos los `txStatusMeta` / `tournamentStatusLabel` / helpers tienen
  el caso. Audit pasado pescó 2 casos donde solo 2 de 8 estados se mapeaban.
- [ ] Realtime publication incluye la tabla si cambia el status.
- [ ] Action que transiciona al status nuevo: emite notif si aplica.

#### Nueva tabla con RLS:

- [ ] Realtime publication si el cliente la escucha.
- [ ] Audit trigger `tg_audit_<table>` si admin la muta.
- [ ] Index para queries frecuentes.
- [ ] Admin governance: pantalla para listar/inspeccionar (regla del
  checklist 07 §1.9).
- [ ] Doc en `architecture/20-database.md §29`.

#### Nuevo feature gated por MP+:

- [ ] Helper `isPlanActive(profile).tier === 'premium'` usado en lugar
  de chequear `plan_tier` directo (cron puede no haber expirado).
- [ ] UI muestra badge/banner cuando free está al cap.
- [ ] Server action retorna error específico (no genérico) para que UI
  muestre CTA al upgrade.
- [ ] Sección "Qué incluye MP+" en `/dashboard/user/mi-plan` actualizada.

### Paso 11 — Reportar gaps con fix sugerido

Output formato:

```
## Logic Review: <feature>

### Gaps de coherencia encontrados

| # | Gap | Surface afectada | Fix sugerido |
|---|---|---|---|
| 1 | X searchable pero no visitable | /amigos descubrir → /players/[id] 404 | Permitir route + vista compacta para is_system |
| 2 | Action key mismatch | DiscoverCard → SendFriendRequestSchema | `{userId}` → `{toUserId}` |
| 3 | RLS bloquea sender system sin bypass | fn_send_system_message en mig 105 | ✅ ya usa SECURITY DEFINER |

### Aplicar fixes?
```

Si user dice sí, aplicar uno por uno. Si no, dejar reporte.

## Cosas a evitar

- **Review superficial sin recorrer las 6 dimensiones**: gaps quedan ocultos.
- **Asumir que TS habría atrapado el bug**: TS no atrapa runtime mismatches en server actions, RLS violations, ni triggers + downstream queries.
- **No documentar gaps deliberadamente ignorados**: cualquier `⚠️` que decidamos NO fixear ahora debe ir a `04-placeholders.md` con razón.

## Anti-patrones que detectar

| Síntoma | Bandera |
|---|---|
| Entidad X aparece en lista A pero no en lista B | Sync cross-surface roto |
| Action acepta payload con key K1 pero schema espera K2 | Invalid input garantizado |
| Operación O sobre X funciona para tipo normal pero no para tipo especial | Caso especial no manejado |
| Trigger inserta `kind=Y` pero ninguna query filtra ese kind | Row creado pero invisible |
| RLS restrictive bloquea un actor que necesita bypass legítimo | Feature funcional muerta silenciosa |
| `as never` proliferando en queries | Database types stale, regenerar |
| Migration aplicada vía MCP sin archivo local committed | Drift entre dev y prod |
| Trigger usa `coalesce(plan_tier, 'free')` pero código TS espera siempre un valor explícito | Default desincronizado |
| Botón visible sin `onClick` (o con `onClick={() => {}}`) | Wire faltante |
| `useState` o prop declarada pero nunca leída en el body | Code muerto |
| Server action retorna `{ id }` pero caller no navega ni muestra | Redirect olvidado |
| Nuevo `notification_kind` sin mapping en `iconForKind`/`hrefForKind` | Notif aparece sin icono ni click navigation |
| Nuevo `conversations.kind` sin entrada en `ConvoLite` type / query filter | Conv invisible aunque existe en DB |
| Nuevo `RoleKey` sin sidebar config / RoleSwitcher entry | Rol existe en DB pero no en UI |
| Nuevo status enum sin actualizar el helper que mapea a label/color | Status renderiza como string crudo |
| Form que valida en server pero no en cliente | UX "Invalid input" sin contexto |
| Permission gate redirige a 403 sin fallback role | Dead end |

## Cómo se conecta con las otras skills

- `matchpoint-feature-plan` → planning. Esta skill cierra el loop validando post-implementación.
- `matchpoint-ui-review` → visual. Esta cubre lo funcional/lógico.
- `emil-design-eng` → animación. Ortogonal.
- `matchpoint-docs-guide` → input pasivo (lectura). Esta skill consume esa lectura para validar.

Trío recomendado para todo stage de feature:
1. `matchpoint-docs-guide` → leer docs aplicables.
2. `matchpoint-feature-plan` → planear con matriz de visibilidad + admin governance.
3. Implementar.
4. `matchpoint-ui-review` → visual QA.
5. **`matchpoint-logic-review`** → coherencia funcional.
6. Commit.

## Cuando NO usar esta skill

- Fix trivial de copy/spacing.
- Refactor que no cambia comportamiento.
- Cambios solo en doc.

Para cualquier feature con 3+ archivos tocados o cualquier comportamiento nuevo: invocarla.
