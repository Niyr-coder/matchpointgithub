# QA · Panel admin de eventos y torneos

Checklist manual end-to-end para validar todo lo construido en el bloque
de soporte admin (Agentes A–F + payment_policy + no-show).

## Prerequisitos

1. **User admin existe en `auth.users`**. Si todavía no, regístrate vía
   `/auth/signup` con tu email.
2. **Correr el seed**:
   - Abrí `scripts/seed-qa-admin-events.sql`.
   - Verificá que `v_admin_email` apunte al email correcto (por defecto
     `andrews@matchpoint.top`).
   - Pegá el SQL en Supabase Studio → SQL editor → Run. O ejecutalo vía
     MCP supabase `execute_sql`.
   - El seed promueve a admin al user, crea club + partner + 4 torneos +
     4 eventos (uno por policy). Idempotente.
3. **Levantá el dev server**: `npm run dev` → http://localhost:3000.
4. **Iniciá sesión** con el user admin. Vas a poder entrar a
   `/dashboard/admin` y ver el sidebar completo.

> Tip: el seed crea torneos con slug `qa-tournament-<policy>` y eventos
> `qa-event-<policy>`. Para limpiar, ver el header del seed.

---

## Sección 1 · Crear y editar (admin / organizador)

### 1.1 · Crear evento con policy desde modal del club

- Entrá al dashboard del club (rol owner) → "Crear evento" abre
  `CrearEventoModal`.
- Cambiá el precio a `0` → el selector "¿Cómo cobras la inscripción?"
  **debe ocultarse**. Solo se muestra el aviso "evento gratis".
- Subí el precio a `10` → debe aparecer el selector con 3 botones
  (prepay / onsite / flexible). El primero queda activo por default.
- Probá cada uno. El borde queda verde en el activo.
- Confirmá y publicá. El evento se crea con la policy elegida.
- **Verificación DB**: `select name, price_cents, payment_policy from
  events where name ilike '%nuevo evento%';`

### 1.2 · Editar policy desde admin

- Andá a `/dashboard/admin/admin-events`. Encontrá uno de los seeded
  (`qa-tournament-flexible` por ej.). Click → detalle.
- Clic en **Editar** (arriba del header).
- Cambiá precio a `0` → selector de policy **debe desaparecer**, aparece
  "Torneo gratis · sin política de cobro".
- Cambiá precio a `5000` con policy `flexible` → guardá.
- **Verificación DB**: `select name, entry_fee_cents, payment_policy
  from tournaments where slug = 'qa-tournament-flexible';`
- Probá enviar policy `free` con precio > 0 → debe rechazar con error
  `POLICY_MISMATCH`.

### 1.3 · Reprogramar (notificación encolada)

- Editá `qa-tournament-prepay`. Cambiá `startsAt` a otro día.
- Guardar → toast dice "Se notificará a los inscritos del cambio".
- **Verificación DB**: 
  ```sql
  select kind, payload->>'tournament_name', status from notification_jobs
  where kind = 'tournament_rescheduled' order by id desc limit 5;
  ```
  Debe haber un job por cada inscripto activo (en este punto 0 porque
  nadie se inscribió todavía — volvé a este test después de Sección 2).

---

## Sección 2 · Inscripción (user)

### 2.1 · Inscribirse en torneo gratis

- Logueate como otro user (creá un user nuevo si necesitas: `tester@…`).
- Andá a `/dashboard/<rol>/eventos` (la pantalla `EventosScreenClient`).
- Filtrá por "Próximos" → encontrá `QA · Torneo gratis`.
- Click → detalle → "Inscribirme ahora".
- **Esperado**: toast verde "¡Inscrito!". No hay redirect.
- **Verificación DB**:
  ```sql
  select status, paid_transaction_id from registrations
  where tournament_id = (select id from tournaments where slug='qa-tournament-free');
  ```
  Status = `pending`, paid_transaction_id = NULL.

### 2.2 · Inscribirse en torneo prepay → redirect a /pagos

- Mismo flujo con `QA · Torneo prepay`.
- **Esperado**: toast "Inscripción creada" + redirect a
  `/pagos/<UUID>`.
- En `/pagos/[id]` debería verse la página de upload (componente
  `PaymentProofView`).
- Subí cualquier imagen como comprobante.
- **Verificación DB**:
  ```sql
  select status, proof_url, proof_submitted_at from transactions
  where customer_user_id = '<tu user id>'
  order by created_at desc limit 1;
  ```
  Status debe ser `proof_submitted`, proof_url presente.

### 2.3 · Inscribirse en torneo onsite

- Mismo flujo con `QA · Torneo onsite`.
- **Esperado**: toast "¡Inscrito!" sin redirect (no requiere
  comprobante, paga en mostrador).
- **Verificación DB**: registration status = `pending`, transaction con
  status = `pending` (sin proof_url, sin proof_submitted_at).

### 2.4 · Inscribirse en torneo flexible

- Mismo flujo con `QA · Torneo flexible`.
- **Esperado**: aparece modal "¿Cómo prefieres pagar?".
  - Si elegís "Pago online" → redirect a `/pagos/[id]`.
  - Si elegís "Pago en sitio" → toast directo, sin redirect.
- Probá los 2 caminos (regístrate con users distintos para no chocar
  contra el unique constraint).

### 2.5 · Inscripción en evento (events.kind) vía curl

No hay UI cableada para events.kind. Probá:

```bash
# Obtené tu cookie de sesión desde DevTools (sb-<proj>-auth-token).
# Luego (reemplazá EVENT_ID por el id real de qa-event-prepay):
curl -X POST http://localhost:3000/api/v1/events/EVENT_ID/register \
  -H "content-type: application/json" \
  -H "cookie: <copia desde devtools>" \
  -d '{}'
```

Respuesta esperada (prepay): `{"data": {"status": "pending_payment",
"paidTransactionId": "<uuid>"}}`. Andá manual a `/pagos/<uuid>` para
subir comprobante.

Para `qa-event-flexible`: agregá `"paymentMode": "online"` o `"onsite"`
al body.

---

## Sección 3 · Admin actions sobre inscritos y pagos

> Estos tests asumen que ya hay inscripciones de Sección 2.

### 3.1 · Aprobar comprobante (admin)

- Logueate como admin.
- `/dashboard/admin/admin-pagos` → sección "Comprobantes pendientes".
- Verás las transactions con `status='proof_submitted'`.
- Click "Aprobar" → modal confirma.
- **Esperado**: transaction pasa a `captured`, la inscripción ligada
  flippa a `registered` (event) o `accepted` (tournament).
- **Verificación**: refrescá `/dashboard/admin/admin-events/<event-id>`,
  la registración debe verse en estado verde.

### 3.2 · Rechazar comprobante

- En la misma pantalla, click "Rechazar" en otra transaction.
- Pedí motivo, confirmá.
- **Esperado**: transaction vuelve a `pending_proof`, el campo
  `proof_rejection_reason` queda guardado.
- El user puede volver a `/pagos/[id]` y resubir comprobante.

### 3.3 · Marcar asistencia / no-show

- En el detalle del evento (admin), `EventRegistrationsTable` → kebab
  menu de una inscripción `registered`.
- **Marcar asistencia** → status pasa a `attended`. Botón cambia a
  "Revertir asistencia".
- **Marcar no-show** → modal de confirmación. Si la inscripción tiene
  una transacción ligada no captured (e.g. onsite que nunca pagó), se
  marca como `failed` automáticamente.
- **Verificación**: kebab ya no muestra "Marcar no-show" en esa fila.

### 3.4 · Transferir cupo (eventos)

- Crea un user nuevo (recordá: necesita un profile). Copiá su UUID
  desde el panel "Admin · Usuarios".
- Detalle del evento → kebab → "Transferir cupo".
- Pegá el UUID destino → confirmar.
- **Verificación**: la inscripción ahora pertenece al user destino.
  Trying to transferir a un user que ya está inscrito devuelve error.

### 3.5 · Refund manual

- En `EventTransactionsTable` o `TournamentTransactionsTable`, click
  "Marcar reembolsada" en una transaction `captured`.
- Modal: motivo (obligatorio) + referencia (opcional) + checkbox
  "Cancelar también la inscripción".
- Confirmá.
- **Esperado**: transaction pasa a `refunded`, registración a
  `cancelled` (si el checkbox estaba), entrada en audit.

### 3.6 · Cancelar evento o torneo

- Botón "Cancelar evento" en la barra de acciones del detalle.
- Modal con motivo. Confirmar.
- **Esperado**: evento status = `cancelled`. La acción ya no aparece.
- Sin refunds automáticos (la doc del modal lo aclara).

### 3.7 · Reasignar organizador

- "Reasignar organizador" en ActionsBar. Buscá por username/displayName.
- Seleccioná un user con rol admin/owner/manager/partner.
- Confirmá.
- **Esperado**: `events.organizer_id` / `tournaments.created_by` cambia
  al nuevo user. Audit log lo registra.

### 3.8 · Contactar organizador

- Click "Contactar organizador" en ActionsBar.
- **Esperado**: abre el cliente de mail con un mailto al email del
  organizador (vía `auth.users.email`, leído por service role en
  `getEventForAdmin`).
- Si el botón está disabled → falta exponer email. No debería pasar
  después del fix.

---

## Sección 4 · Auditoría

### 4.1 · Audit log por evento

- Después de hacer N acciones en un evento de seeds, abrí el detalle.
- Scroll hasta la sección "Historial".
- **Esperado**: timeline ordenado desc con entradas como:
  - "Editó evento" (action `event.admin_edit`).
  - "Cancelación de inscripción" si removiste alguna.
  - "Nueva transacción" cuando se creó una.
- Cada entrada muestra actor (display_name) y "Ver diff" expande JSON.

### 4.2 · Audit raw

```sql
select created_at, entity, entity_id, action, actor_id, diff
from audit_log
where entity in ('events', 'tournaments', 'event_registrations',
                 'registrations', 'transactions')
order by created_at desc
limit 30;
```

Debe haber filas con `action='UPDATE'` (del trigger tg_audit) **y**
filas con actions semánticas (`event.admin_edit`, `event_registration.
admin_mark_no_show`, etc.) cuando aplica.

---

## Sección 5 · Bordes y errores esperados

| Caso | Esperado |
|---|---|
| Inscribirse 2 veces al mismo evento | Error `EVENTS.ALREADY_REGISTERED` (409) |
| Inscribirse a evento `cancelled` | Error `EVENTS.NOT_REGISTERABLE` (422) |
| Cupo lleno + intentar inscribirse | Error `EVENTS.FULL` (409) |
| Editar evento `finished` | Error `EVENTS.NOT_EDITABLE` (409) |
| Editar policy a `free` con price > 0 | Error `EVENTS.POLICY_MISMATCH` (422) |
| Aprobar tx que no está en `proof_submitted` | Error `PAYMENT_PROOF.INVALID_STATE` (409) |
| Refund de tx que no está `captured` | Error `TX.NOT_REFUNDABLE` (409) |
| Marcar no-show de inscripción `cancelled` | Error `EVENT_REG.CANCELLED` (409) |
| Reasignar organizador al mismo user | Error `ADMIN.ORG.SAME_USER` (422) |
| Inscripción en torneo flexible sin paymentMode | Error `TOURNAMENTS.PAYMENT_MODE_REQUIRED` (422) — UI dispara modal automáticamente |

---

## Sección 6 · Fuera de scope (no se testea aún)

- **Notificaciones push/email**: solo se encolan jobs en
  `notification_jobs`. El dispatcher real no está integrado todavía.
- **Penalizaciones / multas**: no implementado; el `no_show` solo deja
  data en `event_registrations.status` para uso futuro.
- **Landing pública `/eventos/[slug]`**: sigue con paywall, no se cableó
  inscripción real.
- **Inscripción a events.kind desde UI**: solo vía curl por ahora.
