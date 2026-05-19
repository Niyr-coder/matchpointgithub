---
name: matchpoint-logic-review
description: Revisa consistencia lógica cross-cutting de una feature recién implementada en MatchPoint v2 — entidades que se pueden buscar pero no visitar, acciones disponibles en un contexto pero rotas en otro, casos especiales (system users, archived, soft-deleted) manejados en una superficie pero olvidados en otra, schema keys que no matchean entre caller y action, RLS restrictions sin SECURITY DEFINER bypass donde se necesita, triggers que crean rows que downstream queries no esperan. Úsala DESPUÉS de implementar (o cuando aparece un bug funcional que parece "estructural") y ANTES del commit final. Complementa `matchpoint-ui-review` (visual) y `emil-design-eng` (animación) — esta cubre la coherencia funcional del sistema. Produce una lista de gaps de consistencia con archivo:línea + fix sugerido.
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

### Paso 8 — Reportar gaps con fix sugerido

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
