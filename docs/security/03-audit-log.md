# Audit log

> Tabla append-only de eventos críticos. **Si alguien dispute algo
> (cobros, suspensiones, override admin)**, esto es la prueba. Si vas a
> agregar una acción sensible, **debe loguearse aquí**.

## 1. Tabla

`public.audit_log` (mig 003+, triggers en `99_audit_triggers.sql`):

```sql
id uuid pk,
created_at timestamptz default now(),
actor_id uuid,                    -- quién hizo la acción
actor_role text,                  -- rol activo del actor
club_id uuid,                     -- contexto club (cuando aplica)
entity text not null,             -- nombre de tabla
entity_id uuid,                   -- id del row afectado
action text not null,             -- 'INSERT' | 'UPDATE' | 'DELETE' | nombre custom
diff jsonb                        -- payload con before/after o snapshot
```

RLS:
- SELECT solo admin
- INSERT: ❌ vía RLS — escritura **solo por triggers** `tg_audit`
  (SECURITY DEFINER) o función `fn_admin_audit_log` (idem)
- UPDATE/DELETE: ❌ — append-only, inmutable

## 2. Dos vías de logueo

### A. Trigger automático `tg_audit`

Aplicado a tablas críticas en mig 099 (`audit_triggers.sql`):

```sql
create trigger tg_audit_<tabla>
  after insert or update or delete on public.<tabla>
  for each row execute function tg_audit();
```

El trigger:
- Lee `auth.uid()` para `actor_id`
- Lee `app.active_role` y `app.active_club_id` (setteados por proxy)
- Para INSERT → `diff = to_jsonb(NEW)`
- Para DELETE → `diff = to_jsonb(OLD)`
- Para UPDATE → `diff = { "before": OLD, "after": NEW }`

Tablas con trigger automático (lista parcial — ver mig 099):
- `transactions` — todas las mutaciones
- `clubs`, `club_applications`
- `tournaments`
- `registrations`
- `player_subscriptions`
- `role_assignments`

### B. Logueo manual `fn_admin_audit_log`

Para eventos que **no son** mutaciones directas a tablas (ej. acciones de
soporte que combinan varias cosas):

```sql
-- SQL function (SECURITY DEFINER)
fn_admin_audit_log(
  p_entity text,
  p_entity_id uuid,
  p_action text,
  p_diff jsonb
)
```

Llamada típica desde server action:

```ts
await admin.rpc("fn_admin_audit_log", {
  p_entity: "tournaments",
  p_entity_id: tournamentId,
  p_action: "tournament.cancelled",   // nombre custom descriptivo
  p_diff: { from: previousStatus, to: "cancelled" } as never,
});
```

**Convenciones de `action`**:
- `<tabla>.<verbo>` para acciones custom: `tournament.cancelled`,
  `plan_subscription.admin_grant`, `payment_proof.rejected`.
- El trigger usa los verbos SQL: `INSERT`, `UPDATE`, `DELETE`.
- Si un mismo evento dispara trigger + manual log, **ambos quedan** —
  inocuo.

## 3. Acciones logueadas hoy (catálogo)

### Disparadas por trigger (todas las mutaciones de):
`transactions`, `tournaments`, `registrations`, `clubs`,
`club_applications`, `player_subscriptions`, `role_assignments`

### Disparadas manualmente (acciones custom)

| Action | Disparada por | Diff payload |
|---|---|---|
| `tournament.cancelled` | `setTournamentStatus(cancelled)` | `{ from, to }` |
| `tournament.admin_edit` | `updateTournamentAdmin` | `{ keys: { before, after } }` |
| `tournament.partner_edit` | `updateTournamentByOrganizer` | `{ keys: { before, after } }` |
| `plan_subscription.admin_grant` | `grantMatchPointPlusAdmin` | `{ granted_to, granted_by, duration_months, expires_at, reason }` |
| `plan_subscription.admin_revoke` | `revokeMatchPointPlusAdmin` | `{ revoked_by, reason, cancelled_subs }` |
| `club_application.approved` | `quickApproveApplication` | `{ application_id, club_id, applicant_id, approved_by }` |
| `club_application.rejected` | `rejectApplication` | `{ application_id, reason, rejected_by }` |

## 4. Cómo consultar

### Por entidad
```sql
select created_at, actor_id, actor_role, action, diff
from audit_log
where entity = 'tournaments' and entity_id = '<uuid>'
order by created_at desc;
```

### Por actor (qué hizo un user)
```sql
select created_at, entity, entity_id, action, diff
from audit_log
where actor_id = '<uuid>'
order by created_at desc
limit 100;
```

### Por acción específica
```sql
select created_at, actor_id, entity_id, diff->>'reason' as reason
from audit_log
where action = 'plan_subscription.admin_revoke'
order by created_at desc;
```

### Eventos sospechosos (mass actions)
```sql
-- Actor que mutó muchas rows en poco tiempo
select actor_id, entity, count(*) as n
from audit_log
where created_at > now() - interval '1 hour'
group by actor_id, entity
having count(*) > 100
order by n desc;
```

## 5. UI admin (cuando exista)

Pantalla `/dashboard/admin/admin-audit` consume `audit_log`. Hoy con
placeholders, debería:
- Filtros por: actor, entity, action, rango de fechas
- Render `diff` como JSON con highlight de cambios (before/after)
- Export CSV
- Link a la entidad afectada cuando aplica

## 6. Retention

**Hoy**: sin política. Los rows se acumulan indefinido.

**Recomendación** (TODO):
- Eventos > 2 años → mover a tabla de cold storage o S3.
- Eventos críticos (cancelaciones, refunds, grants) → guardar **forever**
  (compliance / disputa).
- Mutaciones de bajo valor → puede comprimirse cada 90 días.

## 7. Cuándo loguear manualmente

Loguear con `fn_admin_audit_log` si:
- La acción NO es una mutación 1-tabla simple (ej. cancelación de torneo
  toca tournaments + notif + refunds).
- Es una acción admin con motivo libre (grant/revoke/refund con razón).
- Disputas futuras pueden requerir reconstruir el contexto exacto.

NO loguear manualmente si:
- Ya hay trigger en la tabla — el trigger ya lo capturó.
- Es una operación de bajo valor (login, scroll, etc).

## 8. Best-effort vs bloqueante

Los logs son **best-effort** — si fallan, la acción principal sigue:

```ts
const { error: auditErr } = await admin.rpc("fn_admin_audit_log", { ... });
if (auditErr) {
  console.error("[my_action] audit failed:", auditErr.message);
  // NO throw — el negocio continúa
}
```

Excepción: para acciones críticas de compliance (refunds, suspensiones),
considerar bloquear si el audit no se persiste.

## 9. Anti-patrones

1. **Loguear datos sensibles en `diff`** — el diff es solo lecturable por
   admin, pero igual no incluyas passwords, tokens, comprobantes
   completos.
2. **`UPDATE audit_log`** — la tabla es append-only. Si necesitas corregir,
   insertás un evento nuevo con `action='audit.correction'`.
3. **Saltarse el log "porque la acción es chica"** — si es admin override
   o afecta dinero, **siempre loguear**.

## 10. Triggers nuevos al agregar tabla crítica

Si la nueva tabla maneja dinero/permisos/data sensible:

```sql
-- en migration nueva (o en 099 actualizada)
create trigger tg_audit_<tabla>
  after insert or update or delete on public.<tabla>
  for each row execute function tg_audit();
```

Si la tabla tiene UPDATEs muy frecuentes (ej. estado de juego en vivo),
considerar **no** auditar UPDATEs (sería ruido). Solo INSERT/DELETE.

## 11. TODOs

- [ ] UI admin para `audit_log` real (hoy stub)
- [ ] Retention policy + archivo a cold storage
- [ ] Audit de lecturas (no solo mutaciones) para datos súper sensibles
- [ ] Alertas de detección de patrones (ej. 100 cancelaciones de torneo
      en 1 hora = sospechoso)
- [ ] Audit log de logins (hoy solo Supabase Auth dashboard)
