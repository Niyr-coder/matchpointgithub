---
name: matchpoint-docs-guide
description: Lee la documentación relevante en docs/ ANTES de implementar cualquier cambio en MatchPoint v2. Úsala cuando el usuario pida agregar/modificar lógica de torneos, pagos, premium/MatchPoint+, roles, RLS, realtime, notificaciones, audit, broadcasts, nuevas tablas, server actions, endpoints o pantallas. También úsala cuando vas a cambiar schema de Supabase, agregar migration, tocar policies de RLS, sumar tablas al publication de realtime, agregar notif_kinds, o crear/modificar payment flows. Asume que docs/architecture/, docs/product/, docs/guides/, docs/security/, docs/privacy/ son la fuente de verdad y que NO leerlos antes lleva a duplicar lógica, romper sincronía cross-superficie y violar el contrato de RLS.
---

# MatchPoint Docs Guide

Esta skill garantiza que cualquier cambio en MatchPoint v2 respete los patrones documentados, en lugar de reinventar la lógica o romper la sincronía entre superficies (gestión partner ↔ vista pública ↔ widget del jugador ↔ notif).

## Por qué existe

MatchPoint tiene reglas duras que NO son evidentes leyendo solo el código:

- RLS estricta que delega mutaciones a `getAdminClient` después de validar rol → si te equivocas, la action falla silenciosa o expone datos.
- Audit log que SOLO captura actor cuando el caller llama `setAuditActor()` antes de mutar con service-role.
- Realtime que requiere agregar tablas al publication explícito en una migration.
- Pagos por transferencia/DeUna manual (NO Stripe) — el refund es UPDATE de estado, no llamada a PSP.
- Notificaciones que requieren `kind` pre-seedado en `notification_kinds` antes de poder enviarse.
- Premium ("MatchPoint+") con flujo manual de grant admin + auto-extender expiry.
- Estelar es feature pagada ($20), solo admin la activa post-cobro.
- Sincronía cross-superficie: cancelar un torneo debe propagar a `/eventos`, widget "Mis torneos" del user, panel partner, notif, audit, realtime.

Si saltas los docs y arreglas algo "sólo en el código", se rompe alguna de esas superficies en silencio.

## Cuándo se dispara

Esta skill se carga automáticamente cuando el usuario menciona o trabaja en:

- Torneos / inscripciones / brackets / categorías / premios
- Pagos / comprobantes / refunds / payouts / comisiones
- Premium / MatchPoint+ / grant / revoke
- Estelar / featured / portada
- Roles / role_assignments / permisos
- RLS / policies / SECURITY DEFINER
- Realtime / publication / subscriptions
- Notificaciones / notif_kinds / dispatcher
- Audit / audit_log / actor
- Broadcasts / marketing
- Reservas / canchas / walk-ins / check-ins
- Migrations / nuevas tablas / nuevos triggers
- Cualquier server action nueva o endpoint en `src/server/actions/` o `src/app/api/`
- Nuevas pantallas que muestren datos cross-tenant

## Cómo aplicarla

### Paso 1 — Detectar el área del cambio

Mapea la solicitud a una o más áreas. Si abarca varias, leer todos los docs aplicables (no elegir uno).

| Área del cambio | Docs obligatorios |
|---|---|
| Schema (tablas, enums, columnas) | `docs/architecture/20-database.md` (§29 = adds post-MVP) |
| RLS / cuándo usar admin vs server client | `docs/architecture/30-rls.md` (§9 incluye patrón `setAuditActor`) |
| Realtime / sumar tabla al publication | `docs/architecture/50-realtime.md` (§15) |
| Flujos de torneo (crear/cancelar/inscribir/scoring/MPR) | `docs/product/01-tournaments.md` |
| MatchPoint+ (premium, billing manual, grant admin) | `docs/product/00-matchpoint-plus.md` |
| Pagos, comprobantes, refunds, take rate, payouts | `docs/product/02-payments.md` |
| Notificaciones (nuevo kind, dispatcher, sync) | `docs/guides/02-notifications.md` |
| Roles y permisos | `docs/guides/00-roles.md` |
| Flujos cross-superficie (gestión ↔ pública ↔ widget) | `docs/guides/01-flows.md` |
| Placeholders / datos vacíos | `docs/guides/04-placeholders.md` |
| Design system / tokens | `docs/guides/05-design-system.md` |
| Platform config (take rate, estelar price) | `docs/guides/03-platform-config.md` |
| Seguridad general | `docs/security/00-overview.md` |
| Audit log | `docs/security/03-audit-log.md` |
| Privacidad / retención | `docs/privacy/00-data-collection.md`, `02-retention.md` |

### Paso 2 — Leer ANTES de tocar código

Usa `Read` directamente. Si el doc es largo, busca con `Grep` la sección relevante por keywords (ej. "Cosas que rompen seguido", "Sincronía cross-superficie", "Reglas para el dev", el nombre exacto de la tabla/función).

Cada doc de architecture/ y guides/ tiene secciones:

- **Cosas que rompen seguido** → trampas conocidas y por qué se rompen.
- **Sincronía cross-superficie** → todas las superficies que debes actualizar.
- **Reglas para el dev** (en `docs/README.md`) → lista de cosas a mantener en sync.

### Paso 3 — Identificar patrones aplicables

Antes de escribir cualquier línea:

- ¿Hay un helper SECURITY DEFINER ya existente? (`mp_user_is_*`, `mp_set_audit_actor`, etc) → reusarlo, no duplicar lógica.
- ¿La mutación pasa por service-role? → debes llamar `setAuditActor(admin, callerId, "admin")` antes.
- ¿La tabla es realtime? → ya está en publication, o necesitas migration para agregarla.
- ¿Hay notif que disparar? → el `kind` está en `notification_kinds` (sino agregar mig de seed).
- ¿Es cross-tenant read? → revisar RLS antes de usar `getServerClient`. Si no pasa, `getAdminClient` post-validación.
- ¿Es pago? → recordar NO PSP automático, transferencia/DeUna manual, refund = UPDATE.
- ¿Es feature pagada? → tabla `platform_config` (no hardcoded).

### Paso 4 — Implementar respetando el contrato

Escribir el cambio aplicando los patrones del doc. Si tu cambio:

- Crea nueva tabla → agregar `tg_audit` trigger, agregar policies RLS, agregar al publication realtime si corresponde.
- Crea nueva notif → seed kind en migration nueva, dispatcher en server action.
- Crea nuevo flujo admin → `setAuditActor` antes de mutar.
- Toca pagos → respetar status `pending_proof → captured`, no automatizar refund.
- Toca premium → respetar `extender desde expiry vigente, no resetear`.
- Toca torneo cancelado → propagar a `/eventos` (force-dynamic), widget "Mis torneos", notif `tournament_cancelled`, audit.

### Paso 5 — Actualizar la doc

Si tu implementación:

- Agrega tabla/enum/función → actualizar `docs/architecture/20-database.md` §29.
- Cambia patrón RLS → actualizar `docs/architecture/30-rls.md` §9.
- Suma tabla al publication → actualizar `docs/architecture/50-realtime.md` §15.
- Agrega nuevo flujo cross-superficie → actualizar `docs/guides/01-flows.md`.
- Cambia el contrato de pagos / premium / estelar → actualizar `docs/product/*`.

Si NO actualizas el doc, el próximo dev (o el próximo Claude) repite el bug.

## Cosas a evitar

- No leer el doc y "deducir del código" → te pierdes las secciones "Cosas que rompen seguido".
- Crear migration sin verificar que la tabla/función no exista → `create table if not exists` esconde divergencias (regla de `feedback_check_schema_before_migrate.md`).
- Tocar UI/pantalla sin propagar a todas las superficies del mismo flujo.
- Usar service-role sin `setAuditActor` → audit queda con `actor=null, role=system`.
- Hardcodear precios o porcentajes → usar `platform_config`.
- Inventar terminología → es MPR (MatchPoint Rating), NO DUPR.
- Modismos rioplatenses en commits/UI/docs → español ecuatoriano neutro con tuteo.

## Cuando NO usar esta skill

- Bug fix puramente visual (color, spacing) sin tocar data ni lógica.
- Rename de variable interna sin cambio de comportamiento.
- Typo en string UI sin cambio de flujo.

En esos casos, tocar y listo. Los docs solo importan cuando hay cambio de comportamiento, schema, o sincronía.
