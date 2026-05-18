# Flujos end-to-end

> Diagramas ASCII de los flujos clave. Cuando vayas a tocar uno, leelo
> primero — el orden de operaciones importa (auth → mutación → notif →
> realtime → invalidate) y romperlo es la causa #1 de bugs silenciosos.

Convenciones:

```
[User action]      → acción del jugador/partner/admin
< Server action >  → función en src/server/actions/
{ Table mutation } → escritura a DB
* Notif kind *     → encolado en notification_jobs
≈ Realtime fan-out ≈ → suscriptores del publication reciben
```

---

## 1. Signup + onboarding

```
[Landing /]
    │
    ▼
[Click "Crear cuenta"]
    │
    ▼
< signUp({ email, password, displayName }) >
    │
    ├── Supabase Auth crea auth.users
    ├── Trigger crea row en profiles (mig 003)
    ├── INSERT role_assignments(role='user', user_id=new) → cada user es user por defecto
    ├── Cookie mp_active_role = 'user'
    └── Redirige a /dashboard/user
         │
         ▼
[UserHome con WelcomeBanner + onboarding wizard si profiles.onboarded_at IS NULL]
    │
    ▼
[User completa wizard: skill_level, sport, ciudad, foto]
    │
    ▼
< updateProfile + markOnboarded > → profiles.onboarded_at = now()
    │
    ▼
[UserHome sin wizard]
```

## 2. Cambiar de rol (admin)

```
[Admin en cualquier dashboard]
    │
    ▼
[Click RoleSwitcher (esquina inferior)]
    │
    ▼
[Selecciona "Ver como Partner: MatchPoint Ecuador"]
    │
    ▼
< switchRole({ role: 'partner', partnerId }) >
    │
    ├── Set cookie mp_active_role = 'partner'
    ├── Set cookie mp_active_club_id (si aplica)
    └── return updated session
         │
         ▼
[Client redirect a /dashboard/partner]
    │
    ▼
Layout [role]/layout.tsx valida que admin tenga ese rol (admin = bypass) y renderiza
```

**Gap conocido**: las suscripciones realtime de la pantalla anterior **no se
limpian** automáticamente. Recargar manualmente si quieres que las queries
viejas paren.

## 3. Crear torneo (partner)

```
[Partner en /dashboard/partner/p-torneos]
    │
    ▼
[Click "Crear torneo"] → abre <CreateTournamentFlow> modal
    │
    ▼
Step 1 · T&C
    [Lee 8 cláusulas estrictas + tilda checkbox]
    │
    ▼
Step 2 · Form (10+ campos)
    [Modalidad, scoring preset, fechas, cupos, cuota, payment_policy, etc]
    │
    │ ─── coherencia automática:
    │     cuota=0 → policy=free
    │     cuota>0 + policy=free → forzar prepay
    │
    ▼
Step 3 · Preview (card oscura estilo landing + KPIs)
    │
    ▼
[Click "Crear torneo"]
    │
    ▼
< createTournament(...termsAccepted: true) >
    │
    ├── requirePartnerAdmin(partnerId)
    ├── { INSERT tournaments status='draft', modality, scoring_config, ... }
    └── return { id }
         │
         ▼
[Router push /dashboard/partner/torneo/[id]]
    │
    ▼
Página de gestión con banner naranja "BORRADOR · no visible públicamente"
    │
    ▼
[Partner agrega categorías, cronograma, premios]
    │
    ▼
[Click "Publicar torneo" en PartnerTorneoActions]
    │
    ▼
< setTournamentStatus({ id, status: 'registration_open' }) >
    │
    ├── { UPDATE tournaments status → registration_open }
    │   (via admin client después de validar partner)
    └── ≈ realtime ≈ → suscritos a tournaments ven el cambio
         │
         ▼
[Aparece en /eventos (force-dynamic), apto para inscripciones]
```

## 4. Inscripción a torneo (player)

```
[User en /eventos/[slug] (landing)]
    │
    ▼
[Click "Inscribirme · $X"]
    │
    ├── Si no auth → paywall (login modal)
    └── Si auth → redirige a /dashboard/eventos/[slug]
         │
         ▼
[Dashboard TournamentDetailView]
    │
    ▼
[Click "Inscribirme"]
    │
    ├── Si payment_policy = 'flexible' → abre <PaymentModePicker>
    │   [User elige: online (transferencia) o en club (pago presencial)]
    │
    ▼
< registerToTournament({ tournamentId, paymentMode }) >
    │
    ├── requireUserId()
    ├── Anti-duplicado: trigger DB rechaza si user ya tiene reg pending/accepted
    ├── { INSERT registrations status='pending', player_ids=[uid] }
    │   (via admin client porque RLS no deja al user insertar en torneos
    │    de otros)
    ├── Si paymentMode='online' (prepay):
    │     { INSERT transactions kind='tournament', status='pending_proof' }
    │     UPDATE registrations.paid_transaction_id = tx.id
    │     Redirige a /pagos/[txId] para subir comprobante
    ├── Si paymentMode='onsite':
    │     { INSERT transactions status='pending', method='cash' }
    │     Confirm modal — el partner cobra al llegar
    └── Si payment_policy='free':
          No tx, registration queda pending hasta que partner acepte
         │
         ▼
[Player widget "Mis torneos" en UserHome] ← realtime push
    │
    ▼
[Subir comprobante (si online)] → ver §5
```

## 5. Subir comprobante de pago

```
[User en /pagos/[transactionId]]
    │
    ▼
[Sube archivo (PDF/imagen) a Supabase Storage `payment_proofs/`]
    │
    ▼
< submitPaymentProof({ transactionId, proofUrl }) >
    │
    ├── requireUserId()
    ├── Valida tx.customer_user_id === uid
    ├── Valida tx.status === 'pending_proof'
    ├── { UPDATE transactions } (via admin client):
    │     proof_url = uploadUrl
    │     proof_submitted_at = now
    │     SI kind='tournament':
    │       status = 'captured' (auto-captura, sin revisión)
    │       + UPDATE registrations.status = 'accepted' (donde
    │         paid_transaction_id = tx.id)
    │     SI otros kinds:
    │       status = 'proof_submitted' (cola admin)
    └── ≈ realtime ≈ tournaments+registrations → user ve pill "ACEPTADO"
         │
         ▼
[Si tournament → done. Si otros kinds → admin aprueba/rechaza luego]
```

## 6. Cancelar torneo (partner/admin)

```
[Partner/admin en /dashboard/partner/torneo/[id]]
    │
    ▼
[Click "Cancelar torneo" en PartnerTorneoActions o AdminOverridesPanel]
    │
    ▼
[confirm() — "Esto avisa a los inscritos"]
    │
    ▼
< setTournamentStatus({ tournamentId, status: 'cancelled' }) >
    │
    ├── requireUserId() + authz (admin OR partner_member del partner_org)
    ├── { UPDATE tournaments status='cancelled' } (via admin client)
    ├── SI status anterior != 'cancelled':
    │   ├── SELECT registrations donde status IN (pending, accepted)
    │   ├── Extrae unique player_ids
    │   ├── { INSERT notification_jobs } * tournament_cancelled * para cada player
    │   └── audit_log: 'tournament.cancelled'
    └── ≈ realtime ≈ tournaments → suscriptores ven el banner
         │
         ▼
[Cron fn_dispatch_inapp_notifications cada 5 min consume jobs y crea notifications]
    │
    ▼
[Inscritos reciben bell + "Tu torneo fue cancelado. Si pagaste, te será devuelta"]
    │
    ▼
[Partner debe hacer refunds manualmente — sin auto-creación de refunds]
```

`cancelTournament` (admin) delega en `setTournamentStatus` para reusar la
notif. NO mutar `tournaments` directo desde otras actions o se pierde la
notif.

## 7. Activación MatchPoint+ (admin)

```
[Admin en /dashboard/admin/admin-users]
    │
    ▼
[Click kebab en row de un user → "Activar MatchPoint+"]
    │
    ▼
[Modal pide duración (1/3/12 meses)]
    │
    ▼
< grantMatchPointPlusAdmin({ userId, durationMonths, reason }) >
    │
    ├── requireAdminUserId()
    ├── admin client (RLS bloquea a admin via anon en player_subscriptions)
    ├── Lee profile.plan_expires_at actual
    ├── Calcula new_expires = max(existing_expires, now) + N meses
    ├── { INSERT player_subscriptions status='active', expires_at=new }
    ├── { UPDATE profiles plan_tier='premium', plan_expires_at=new }
    └── audit_log: 'plan_subscription.admin_grant'
         │
         ▼
[User badge premium aparece en TopBar (sin login fresh)]
         │
         ▼
[Cron diario notify-expiring-plans encolará plan_expiring_soon cuando falten 7d]
```

## 8. Rechazo de comprobante por admin

```
[Admin en /dashboard/admin/admin-pagos]
    │
    ▼
[Ve cola de proofs status='proof_submitted' (listPendingProofsAdmin)]
    │
    ▼
[Click "Rechazar" en un row → modal pide razón]
    │
    ▼
< rejectPaymentProofAdmin({ transactionId, reason }) >
    │
    ├── requireAdminUserId()
    ├── admin client (RLS bloquea admin via anon)
    ├── { UPDATE transactions } :
    │     status='pending_proof'  ← vuelve al inicio para re-upload
    │     proof_url = null
    │     proof_rejection_reason = reason
    ├── { INSERT notification_jobs } * payment_proof_rejected *
    │     payload: { transaction_id, kind, ref_id, rejection_reason }
    └── audit (best-effort)
         │
         ▼
[User recibe notif inapp con la razón del rechazo + deep link a /dashboard/user/mi-plan]
```

## 9. Crear reserva de cancha

```
[User en /clubes/[slug] o /dashboard/clubes/[slug]]
    │
    ▼
[Picker fecha + cancha + hora]
    │
    ▼
< createReservation({ courtId, during, sport }) >
    │
    ├── requireUserId()
    ├── Valida no overlap (gist exclude constraint en reservations)
    ├── { INSERT reservations status='requested' o 'booked' según config club }
    └── ≈ realtime ≈ → club staff ve la nueva reserva
         │
         ▼
[Si status='requested' → club staff confirma manualmente]
[Si status='booked' → auto-confirmada]
    │
    ▼
[User ve reserva en /dashboard/user/mis-reservas con realtime push]
```

---

## Pre-flight checklist al implementar un flow nuevo

- [ ] **Auth**: ¿qué `require*` helper aplica?
- [ ] **RLS**: ¿la mutación pasa por `getServerClient` o requiere admin client?
- [ ] **Realtime**: ¿qué tabla(s) deben notificarse? ¿Están en `supabase_realtime`?
- [ ] **Notifs**: ¿qué kind dispara? ¿Está seedeada + branch en dispatcher?
- [ ] **Audit log**: ¿se loguea con `fn_admin_audit_log`?
- [ ] **Cross-superficie**: ¿qué pantallas necesitan reflejarlo? (landing
      público, user dashboard, partner dashboard, club dashboard)
- [ ] **Estados terminales**: ¿qué pasa si el torneo está cancelled/finished?
      ¿Se bloquea la acción?
- [ ] **Idempotencia**: ¿qué pasa si el user dobla-clickea? (`withIdempotency`)
