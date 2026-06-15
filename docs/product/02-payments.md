# Pagos

> **Punto crítico**: MATCHPOINT **NO usa PSP** (Stripe/PayPal/etc). Todo
> pago es por **transferencia bancaria o DeUna** (wallet ecuatoriano).
> Cualquier código que asuma "el pago se procesó" es incorrecto — el cobro
> real lo hace un humano fuera de la app, y nosotros registramos el estado.

## 1. Modelo

### `transactions` (mig 010 + extensiones)
- `id`, `kind` (`reservation | class | tournament | event | plan | club_featuring | quedada | club_membership`)
- `ref_id` — id de la entidad asociada (reservation, tournament, etc)
- `amount_cents`, `currency`, `method` (`transfer | deuna | cash`)
- `status` enum `mp_payment_status`:
  - `pending` — esperando cobro en mostrador (onsite)
  - `authorized` — pre-aprobada (raro hoy, sin PSP)
  - `captured` — cobrada y confirmada
  - `refunded` — reembolsada
  - `failed` — falló
  - `disputed` — el cliente disputó
  - `pending_proof` — esperando comprobante de transferencia
  - `proof_submitted` — comprobante subido, esperando revisión
- `customer_user_id`, `customer_name`
- `club_id` (cuando aplica)
- `proof_url`, `proof_submitted_at`, `proof_reviewed_at`,
  `proof_reviewed_by`, `proof_rejection_reason` (mig 044)
- `created_at`

### `refunds` (mig 010+)
- ligada a `transaction_id`
- contiene `amount_cents`, `reason`, `reference` (nro de comprobante de
  devolución), `created_at`

### `payouts` (mig 081)
Pagos de MP **hacia** clubes/partners. Ver `architecture/20-database.md §29.7`.

## 2. Estados — meta visual

Helper único: `src/lib/ui/transaction-status.ts` exporta `txStatusMeta(status)`
que devuelve `{label, color, background, tooltip}`. **Usar siempre este
helper** en cualquier UI que renderice un status de transaction. NO mapear
inline (regresión histórica que perdimos en el audit).

```ts
import { txStatusMeta } from "@/lib/ui/transaction-status";
const m = txStatusMeta(tx.status);
// <span title={m.tooltip} style={{color: m.color, background: m.background}}>
//   {m.label}
// </span>
```

## 3. Flujo de comprobantes (transferencia / DeUna)

```
1. User completa acción de pago (inscribir torneo, comprar plan, etc)
2. Server action crea row en transactions con status='pending_proof'
3. UI redirige a /pagos/[transactionId] (componente de subir comprobante)
4. User sube foto/PDF a Storage bucket `payment_proofs`
5. Cliente llama submitPaymentProof({ transactionId, proofUrl })
6. Server action:
     - Valida que tx.customer_user_id === auth user
     - Valida que tx.status === 'pending_proof'
     - UPDATE via admin client (RLS no deja al customer)
     - SI kind='tournament' → status='captured' AUTO (decisión producto, sin
       revisión); además marca registration.status='accepted'
     - SI otros kinds (plan, event, club_featuring) → status='proof_submitted'
7. Aprobación admin (solo para kinds que no auto-capturan):
     - Admin entra a /dashboard/admin/admin-pagos
     - Ve cola desde listPendingProofsAdmin()
     - Click "Aprobar" → approvePaymentProofAdmin({transactionId}):
         * UPDATE transaction → captured
         * Cascade per kind:
            - 'event'    → event_registrations.status = 'registered'
            - 'plan'     → approvePlanSubscriptionAdmin (activa la sub)
            - 'club_featuring' → approveClubFeaturingAdmin
     - Click "Rechazar" → rejectPaymentProofAdmin({transactionId, reason}):
         * UPDATE transaction → status='pending_proof', proof_url=null,
           proof_rejection_reason=reason
         * Encola notif `payment_proof_rejected` al customer con la razón
```

**Crítico**: la auto-captura de `kind='tournament'` está en `submitPaymentProof`
líneas 119-150 aprox. Si la rompo, las inscripciones de torneo se quedan en
limbo y los partners reciben quejas. Está documentada en el header del archivo.

### 3.b · Membresías de club (`kind='club_membership'`)

A diferencia de `plan`/`event`/`club_featuring` (aprueba **admin**), el comprobante
de una membresía VIP lo aprueba el **owner/manager del club** vía
`approveClubMembership`, NO el admin de plataforma. Por eso `listPendingProofsAdmin`
**excluye** `kind='club_membership'` (no hay cascada de activación en
`approvePaymentProofAdmin`). Detalle completo en `docs/product/07-club-memberships.md`.

## 4. Flujo onsite (pago en club)

```
1. User se inscribe con paymentMode='onsite'
2. Server crea transaction status='pending', method='cash' (o el método del club)
3. Registration status='pending', paid_transaction_id=tx.id
4. User llega al club, paga al mostrador
5. Partner/staff entra a /dashboard/partner/torneo/[id]
6. Click "Marcar pagado" en la fila (MarkPaidInline component) →
   markRegistrationPaidByPartner({registrationId}):
     - Valida partner_member del torneo
     - UPDATE transaction → status='captured' via admin client
```

Hoy `markRegistrationPaidByPartner` NO actualiza el `registrations.status`
(asume que ya está `pending` y captura le da seña verde). Si el partner
quiere aceptar la inscripción además, debe usar `updateRegistrationStatus`.

## 5. Refunds (devoluciones)

**Sin PSP**, el refund real es una transferencia humana. En la app solo
marcamos estado.

```
admin/partner abre tabla de transactions (Event/TournamentTransactionsTable)
→ ve botón "Marcar reembolsada" en filas con status='captured'
→ modal pide motivo (obligatorio) + referencia (opc) + checkbox
   "Cancelar también la inscripción ligada" (default true)
→ action crea row en refunds + opcionalmente actualiza registration.status='withdrawn'
→ transaction NO cambia status (queda 'captured' + hay refund asociado).
   Para "refunded" puro se setea aparte si se requiere full chargeback.
```

**Por hacer**: cuando el partner cancela un torneo, hoy NO se crean refunds
automáticos. El partner debe ir tx por tx y marcar manualmente. Las cláusulas
del T&C que aceptan al crear el torneo lo obligan a hacerlo en 7 días.

## 6. Take rate (comisión MATCHPOINT)

- Stored en `platform_config.take_rate_pct` (default 10).
- Helper `getTakeRatePct()` en `src/server/queries/platform-config.ts`.
- Usado en `AdminPagosScreen` para calcular `commissionTodayCents` y en la
  generación manual/cron de payouts.
- **Mig 178**: `fn_generate_payouts()` genera payouts mensuales por club para el
  mes cerrado y agenda `cron.schedule('generate-payouts-monthly', '10 8 1 * *')`.
  El panel admin permite procesarlos manualmente y marcar cada payout como pagado.

## 7. Sincronía cross-superficie

| Acción | Refresca dónde |
|---|---|
| `submitPaymentProof` auto-captura tournament | Realtime `transactions` + `registrations` — UserHome mis-torneos pasa pill a accepted, panel partner inscritos actualiza |
| `markRegistrationPaidByPartner` | Realtime `transactions` — panel partner ve pago verde sin recargar |
| `approvePaymentProofAdmin` (plan/event/featuring) | Encola `payment_captured`; para `kind='plan'` además activa MATCHPOINT+ y encola `mp_plus_activated` |
| `rejectPaymentProofAdmin` | Notif inapp al user con `payment_proof_rejected` + razón |
| `markTransactionRefundedAdmin` | Encola `refund_completed` al customer de la transaction |
| `markPayoutPaid` | Realtime `payouts` — admin pagos remueve el payout de pendientes |

### 7.b · Sponsors

`admin-sponsors` registra monto contratado en `sponsor_placements.contract_amount_cents`
para control operativo de campañas. No crea `transactions` todavía y no asume cobro
automático: cualquier facturación/cobro de sponsor sigue siendo proceso manual hasta
que se defina un flujo contable específico.

## 8. Permisos por rol

| Acción | User | Partner | Owner club | Admin |
|---|---|---|---|---|
| Subir su comprobante | ✅ | ✅ | ✅ | ✅ |
| Marcar pago onsite recibido | ❌ | ✅ (su torneo) | ✅ (su club) | ✅ |
| Aprobar comprobante (plan/featuring/event) | ❌ | ❌ | ❌ | ✅ |
| Rechazar comprobante | ❌ | ❌ | ❌ | ✅ |
| Listar pending proofs | ❌ | ❌ | ❌ | ✅ |
| Crear refund manual | ❌ | ❌ | ❌ | ✅ |
| Ver tabla payouts | ❌ | ✅ (los suyos) | ✅ (los del club) | ✅ |

## 9. RLS recap (ver también architecture/30-rls.md §9)

`transactions` policies actuales:
- `tx_staff_all` — staff del club ve y muta sus tx
- `tx_customer_select` — customer ve solo las suyas
- **No hay policy de UPDATE para customer** — por eso `submitPaymentProof`,
  `approve...`, `reject...` usan `getAdminClient()` después de validar rol.

`payment_proofs` no es tabla separada — los campos viven en `transactions`
(`proof_url`, `proof_submitted_at`, etc).

## 10. Cosas que rompen seguido / regla nemónica

1. **NO autoaprobar proof de kind != tournament** — solo torneos.
2. **Cancelar torneo NO crea refunds automáticos** — partner manual.
3. **Usar `txStatusMeta`** en cualquier render de status — no inline.
4. **`getServerClient.update("transactions")` falla silencioso** —
   siempre `getAdminClient()` tras validar rol.
5. **El customer no puede aprobar/rechazar nada** — todo admin/partner.

## 11. PSP piloto (infra, flag off)

Beta actual sigue **sin PSP** (comprobante manual). La infra para checkout con
tarjeta ya está cableada pero **apagada** hasta staging:

| Pieza | Ruta |
|---|---|
| Adaptadores | `src/lib/payments/providers/stripe.ts`, `mercadopago.ts` |
| Registry | `src/lib/payments/registry.ts` |
| Checkout | `src/lib/payments/checkout.ts` + `beginPspCheckoutAction` |
| Webhooks idempotentes | `payment_webhook_events` + `/api/webhooks/stripe`, `/api/webhooks/mercadopago` |
| Cascada post-capture | `src/lib/payments/capture-cascade.ts` (compartida con comprobantes) |
| Flag | `psp_checkout_enabled` (default **off**) |

**Kinds piloto:** `plan`, `tournament`, `event`, `club_featuring`.

**Encender en staging:** migración → env `STRIPE_*` o `MP_*` → webhook URL en
dashboard del PSP → flag `psp_checkout_enabled` ON → UI botón "Pagar con tarjeta"
(pendiente).

**Env:** ver `.env.example` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PSP_DEFAULT_PROVIDER`).

## 12. TODOs

- [ ] Refunds automáticos al cancelar torneo (queue de refunds pendientes
      para que partner solo confirme transferencia)
- [x] Cron que genere payouts mensuales por club restando take_rate
- [x] Notif `payment_captured` al user cuando se aprueba su pago
- [ ] Soporte DeUna como método separado (hoy todo cae en `transfer`)
- [ ] Dashboard de payouts en panel club/partner (hoy ven los rows pero sin
      UI dedicada)
