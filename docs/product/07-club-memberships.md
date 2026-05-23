# Membresías VIP por club (tarjetas de membresía)

> Sistema de membresías de pago **por club** (distinto de MATCHPOINT+, que es
> premium de plataforma, y de `club_followers`, que es seguir gratis). Modelo
> espejo de MATCHPOINT+ scopeado a un club. Migs **147–150**.

## Modelo conceptual

- Un club define **tiers** (`club_membership_tiers`): niveles con precio,
  duración, descuento, beneficios y diseño de tarjeta.
- Un usuario **compra** un tier → tiene una **membresía** (`club_memberships`),
  con número de socio (`member_no`) correlativo **por club**.
- **Una fila por (club, user)** que se **renueva extendiendo** `expires_at`
  desde el vencimiento vigente (no resetea), igual que `profiles.plan_expires_at`.
- **Sin PSP**: cuota por transferencia/DeUna. El comprobante lo aprueba el
  **owner/manager del club** (no el admin de plataforma).

## Tablas (mig 147)

- `club_membership_tiers` — `club_id, name, description, price_cents,
  duration_months, discount_pct, benefits jsonb[], card_design jsonb
  {templateKey, accent?}, sort_order, is_active`.
- `club_memberships` — `club_id, user_id, tier_id, status
  (pending|active|expired|cancelled|rejected), member_no, starts_at, expires_at,
  transaction_id, cancelled_reason`. Unique `(club_id, user_id)` (mig 150).
- `transactions.kind` += **`club_membership`** (ref_id = membership.id).

**RLS**: tiers select público (activos) o staff; write = `mp_club_staff(club_id)`.
memberships select propio o staff; insert propio; update/delete = staff. Mutaciones
de aprobación van con **admin client + `setAuditActor`** (RLS no deja al customer
tocar `transactions`). `club_memberships` en `supabase_realtime`.

## Flujo de pago (cola del CLUB, no del admin)

```
1. Usuario elige tier → requestClubMembership({clubId, tierId}):
     - crea membership status='pending' (upsert por club,user)
     - crea transaction kind='club_membership', status='pending_proof'
     - notif club_membership_requested al staff (owner/manager)
     - retorna { transactionId } → UI redirige a /pagos/[txId]
2. Usuario sube comprobante → submitPaymentProof:
     - kind='club_membership' NO auto-captura → status='proof_submitted'
     - NO entra a la cola del admin (listPendingProofsAdmin filtra .neq club_membership)
3. Owner/manager aprueba → approveClubMembership({membershipId}):
     - tx='captured', membership='active'
     - member_no correlativo por club (una vez)
     - expires_at = (vencimiento vigente futuro || now) + duration_months  ← renovación extiende
     - notif club_membership_activated al usuario
   o rechaza → rejectClubMembership: tx vuelve a 'pending_proof' + notif payment_proof_rejected
   o revoca → revokeClubMembership: membership='cancelled' (sin refund automático)
```

## Expiración (cron, mig 149)

`fn_process_club_memberships()` (cron `process-club-memberships-daily`, 08:15 UTC):
marca `expired` las `active` vencidas y encola `club_membership_expiring_soon`
(≤7 días, dedup por membership_id). Espejo de `fn_process_player_plans`.

## Beneficios (por stages)

- **Identidad** (Stage 1): tarjeta digital (catálogo de plantillas en
  `src/lib/clubs/membership.ts`, estándar de temas) + `member_no` + badge VIP.
- **Descuentos** (Stage 2, pendiente): `discount_pct` cableado en precios de
  reservas/torneos/quedadas del club.
- **Acceso/prioridad** (Stage 3, pendiente): eventos solo-miembros, prioridad de cupo.

## Helper

`isClubMembershipActive({status, expires_at})` en `src/lib/clubs/membership.ts`
(mirror de `isPlanActive`): NO chequear `status==='active'` directo — el cron
puede no haber corrido y `expires_at` puede haber pasado.

## Notificaciones (mig 148)

| Kind | Cuándo | Recipient |
|---|---|---|
| `club_membership_requested` | compra (sube a la cola del club) | owner/manager |
| `club_membership_activated` | el club aprueba el pago | usuario |
| `club_membership_expiring_soon` | cron, vence ≤7d | usuario |

## Take rate

La cuota de membresía respeta `platform_config.take_rate_pct` para futuros
payouts del club (Stage 4). No se aplica todavía (no hay cron de payouts).

## Cosas que rompen seguido

- **NO mandar el comprobante de membresía a la cola del admin** — lo aprueba el
  club. `listPendingProofsAdmin` ya excluye `kind='club_membership'`.
- **Renovación extiende, no resetea** — `expires_at` se calcula desde el
  vencimiento vigente si sigue en el futuro.
- **Una membresía por (club, user)** — `requestClubMembership` hace upsert; no
  se crean filas históricas por compra.
- Usar `isClubMembershipActive`, no `status==='active'` crudo.

## UI (Stage 1B) ✅

- Sección sidebar **`club-membresias`** (owner + manager): `ClubMembershipsScreen`
  → `ClubMembershipsView` (tiers CRUD con preview de tarjeta, cola "por aprobar",
  lista de miembros con aprobar/rechazar/revocar).
- **Compra**: `ClubMembershipBuySection` en la página del club
  (`/dashboard/clubes/[slug]`) → `requestClubMembership` → `/pagos/[txId]`.
- **"Mis membresías"** (`/dashboard/user/membresias`, `MisMembresiasScreen`):
  render de la tarjeta (plantilla del tier, `member_no`, vence) + estado.
- `NotificationsPanel`: icon (`star`), color (`#d4af37`) y href para los 3
  `club_membership_*` (requested → `/dashboard/[role]/club-membresias`).
- Roles: secciones agregadas en `MP_ROLES` (owner/manager/user) + `MP_ROLE_SCREENS`.

## Descuentos (Stage 2) ✅

`getActiveClubDiscountPct(userId, clubId)` + `applyDiscount(cents, pct)` en
`src/server/queries/club-membership.ts`. Se aplica al `amount_cents` de la
transacción al inscribirse a **torneos** y **eventos** del club del que el usuario
es miembro VIP activo (`src/server/actions/tournaments.ts` y `events.ts`).

**Nota de alcance**: reservas (`createReservation`) NO cobran en la app (sin
transacción) y las quedadas son pago offline organizado por un usuario, así que
ahí no hay punto de cobro donde aplicar el descuento. Si en el futuro se agrega
cobro de reservas, aplicar el mismo helper.

## Admin oversight (Stage 4) ✅

`adminListClubMemberships` (admin-only) + `AdminMembershipsScreen`
(`/dashboard/admin/admin-memberships`): lista cross-club de membresías con club,
miembro, tier, vence, estado + total estimado en cuotas activas. Sidebar admin
bajo "Monetización".

**Payouts/take rate**: pendiente hasta que exista el cron de payouts (la cuota
ya respeta `platform_config.take_rate_pct` conceptualmente; ver `02-payments.md §6`).

## Acceso / solo-miembros (Stage 3) ✅

`events.members_only` (mig 151). Si `members_only=true` y el evento tiene
`club_id`, `registerForEvent` exige membresía VIP activa del club
(`hasActiveClubMembership`, error `EVENTS.MEMBERS_ONLY`). El toggle "Solo socios
del club" del `CrearEventoModal` ahora se pasa a `createEvent` (estaba sin
cablear). Prioridad de cupo reservado para miembros: pendiente (futuro).

## Pendiente / próximos stages

- Badge VIP en perfil/roster cross-surface — pendiente (identidad es por-club,
  decidir superficie).
- Payouts/take rate de la cuota (cuando exista cron de payouts).
- Prioridad de cupo para miembros.
