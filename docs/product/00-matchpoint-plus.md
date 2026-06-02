# MATCHPOINT+ (plan premium del jugador)

> Antes de tocar cualquier código de planes/billing/activación de premium,
> leer este doc completo. La activación pasa por flujos manuales que pueden
> romperse silenciosamente si no se entiende el modelo.

## 1. Modelo conceptual

- **Tier** es propiedad del perfil (`profiles.plan_tier`): `'free' | 'premium'`.
- **Subscription** es un período de tiempo activo (`player_subscriptions`).
  Una subscription activa con `expires_at > now()` mantiene `plan_tier =
  'premium'` en el profile.
- **Precio vigente**: MATCHPOINT+ cuesta USD 6.99/mes.
- **No usamos PSP** (Stripe/PayPal). El pago es por transferencia bancaria o
  DeUna (Ecuador), confirmado manualmente por admin. Ver `02-payments.md`.

## 2. Tablas

### `profiles`
- `plan_tier text` ∈ `'free' | 'premium'`
- `plan_expires_at timestamptz` — cuándo deja de ser premium

### `player_subscriptions` (mig 048)
```sql
id uuid pk,
user_id uuid,
tier text,                  -- 'premium' por ahora
status text,                -- 'pending' | 'active' | 'cancelled' | 'expired'
starts_at timestamptz,
expires_at timestamptz,
duration_months int,
transaction_id uuid,        -- nullable; ligada a transactions cuando hay tx
cancelled_reason text
```

RLS (mig 048):
- `player_subs_own_select` — SELECT propio o admin
- `player_subs_own_insert` — INSERT solo si `user_id = auth.uid()`
- `player_subs_admin_update` — UPDATE solo admin

## 3. Flujos

### 3.1 · Compra autoservicio (jugador → premium)

```
1. User visita /dashboard/user/mi-plan
2. Elige duración (1, 3, 12 meses)
3. requestPlanUpgrade() server action:
     - crea row en player_subscriptions con status='pending'
     - crea row en transactions con status='pending_proof', kind='plan'
     - retorna { transactionId } para que el UI redirija a subir comprobante
4. User sube comprobante → submitPaymentProof:
     - transaction.status = 'proof_submitted' (NO auto-captura, kind='plan'
       sigue pasando por admin)
     - aparece en cola de admin (/dashboard/admin/admin-pagos)
5. Admin revisa y aprueba con approvePaymentProofAdmin:
     - transaction.status = 'captured'
     - cascada → approvePlanSubscriptionAdmin se llama desde el handler
     - player_subscriptions.status = 'active'
     - profiles.plan_tier = 'premium', plan_expires_at = sub.expires_at
```

**Cuidado**: cuando hago changes al flow de payment proofs, la cascada para
`kind='plan'` está dentro de `approvePaymentProofAdmin`. Si rompo eso, la
sub no se activa aunque el pago sí.

### 3.2 · Activación admin directa (sin pago)

Para regalos, beta testers, soporte:

```
grantMatchPointPlusAdmin({ userId, durationMonths, reason })
  ├── requireAdminUserId()
  ├── admin client (RLS no deja al admin tocar player_subscriptions vía anon)
  ├── extiende plan_expires_at del profile
  ├── crea sub con status='active' inmediato, transaction_id=null
  └── audit log: 'plan_subscription.admin_grant'
```

Llamado desde `/dashboard/admin/admin-users` → kebab del row → "Activar/
Extender MATCHPOINT+".

### 3.3 · Revocación admin

```
revokeMatchPointPlusAdmin({ userId, reason })
  ├── requireAdminUserId()
  ├── admin client
  ├── todas las subs activas → status='cancelled' + cancelled_reason
  ├── profile.plan_tier = 'free', plan_expires_at = null
  └── audit log: 'plan_subscription.admin_revoke'
```

### 3.4 · Expiración automática (cron)

Mig 049 instala un cron `cleanup-expired-plans` cada 6h:

```sql
update profiles
  set plan_tier = 'free', plan_expires_at = null
  where plan_tier = 'premium' and plan_expires_at < now();

update player_subscriptions
  set status = 'expired'
  where status = 'active' and expires_at < now();
```

Y otro cron `notify-expiring-plans` cada 24h que encola `plan_expiring_soon`
para subs que vencen en ≤7 días.

## 4. Notificaciones

| Kind | Cuándo | Recipient |
|---|---|---|
| `plan_expiring_soon` | Cron diario si vence en ≤7d | el user de la sub |
| `mp_plus_activated` | Admin aprueba comprobante o grant directo | el user de la sub |
| `mp_plus_revoked` | Admin desactiva MATCHPOINT+ | el user afectado |

Dispatcher (mig 050) renderiza: *"Tu plan Premium expira pronto"* + body con
days_remaining + deep-link a `/dashboard/user/mi-plan`.

`mp_plus_activated` y `mp_plus_revoked` se agregaron en la mig 176. Además
se mantiene el DM de sistema `welcome_premium_activated` al aprobar una
subscription pendiente.

## 5. Helper: ¿está activo el plan?

`src/lib/auth/profile.ts` exporta `isPlanActive(profile)`:

```ts
function isPlanActive(p): { tier: 'free' | 'premium', expiresAt: string | null } {
  if (p.plan_tier === 'free') return { tier: 'free', expiresAt: null };
  if (!p.plan_expires_at) return { tier: 'free', expiresAt: null };
  if (new Date(p.plan_expires_at) <= new Date()) return { tier: 'free', expiresAt: null };
  return { tier: 'premium', expiresAt: p.plan_expires_at };
}
```

**Usar siempre este helper** para decidir si mostrar features premium. NO
chequear `plan_tier === 'premium'` directo — el cron puede no haber corrido
y `plan_expires_at` puede haber pasado.

## 6. Sincronía con el landing

- `/` (home landing) muestra MATCHPOINT+ como CTA. Estática, sin user context.
- Una vez logueado, `UserHomeView.tsx` muestra `<UpgradeBanner>` si tier=free.
  - Banner desaparece automáticamente cuando tier=premium.
  - Click → `/dashboard/user/mi-plan`.
- TopBar muestra badge premium pequeño junto al avatar si `isPlanActive`.

**Si toco lógica de premium, verificar**:
1. `UpgradeBanner` se oculta apenas cambia el tier.
2. Cualquier feature gated correctamente — ver §7 features actualmente
   gateadas detrás de `isPlanActive`.
3. El dispatcher de `plan_expiring_soon` no se dispara para subs canceladas.

## 7. Features gateadas detrás de MP+

### 7.1 · Teams (migration 102)

Primer feature real con caps por plan. Implementación: `src/lib/teams/caps.ts`.
Caps viven en `platform_config.team_caps` (JSON) para ajustar sin redeploy.

| Capability | Free captain | MP+ captain |
|---|---|---|
| Crear team | ✅ | ✅ |
| Unirse a team (cualquiera) | ✅ | ✅ |
| **Roster máximo** | **12** | **24** |
| Discovery público (`?view=join`) | ✅ | ✅ |
| Cover/logo upload | ⏸ pospuesto hasta verificación | ⏸ |
| **Invites pendientes simultáneas** | 3 | ∞ |
| Teams como captain | 1 | 1 |
| Stats avanzadas (W/L por oponente, MPR avg, attendance) | básicas | completas |
| **Rename nombre/tag** | 2 veces | 5 veces |

**Validación**: las server actions de `src/server/actions/teams.ts`
chequean los caps antes de mutar. Errores específicos:
- `TEAMS.ROSTER_LIMIT_REACHED` — al invitar / aceptar invite / responder
  request / joinByCode si el team está lleno.
- `TEAMS.INVITES_LIMIT_REACHED` — al invitar si el team tiene >= 3
  pending y el captain es free.
- `TEAMS.ALREADY_CAPTAIN` — al `createTeam` o `transferCaptain` si el
  user destino ya lidera otro team.
- `TEAMS.RENAME_LIMIT_REACHED` — al `updateTeam` con `name` cambiado si
  ya se renombró 2 (free) / 5 (premium) veces.

**Cómo se sienten los gates al user**:
- Free captain mete miembro #13 → toast "Tu team alcanzó el máximo de
  12 miembros. Activa MATCHPOINT+ para subir el límite."
- Free captain manda 4ta invite → toast "Tienes 3 invitaciones pendientes
  (máximo 3). Cancela alguna o activa MATCHPOINT+."
- Free captain renombra una 3ra vez → toast con CTA a MP+.

**Ajustar caps sin redeploy**:
```sql
update public.platform_config
set value = jsonb_set(value, '{free,rosterMax}', '15'::jsonb)
where key = 'team_caps';
```

### 7.2 · Personalización de perfil — retirada

La personalización de perfil V1 ya no es una feature gateada por MATCHPOINT+.
El sistema anterior fue retirado completo: no hay panel de personalización,
paquetes cosméticos, grants ni flags activos. El nuevo sistema queda pendiente
de diseño y deberá documentarse aquí cuando exista una propuesta aprobada.

### 7.3 · Coach AI (sidebar `user` → `coach-ai`)

Pantalla de análisis táctico de video. **Frontend estático con datos mock
por ahora — no hay backend de procesamiento de video todavía.** Vive en
`src/components/dashboard/user/CoachAIScreen.tsx` (server, decide `isPremium`
con `getProfileSummary` + `isPlanActive`) y `CoachAIScreenView.tsx` (client,
tabs Analizar / Último análisis / Historial / Progreso).

**Lo que el plan gatea**:
- Free: ve el item en el sidebar (badge `MP+`) y el hero marketing, pero la
  herramienta se reemplaza por un banner de upsell que dirige a `/mi-plan`.
- Premium: accede a la herramienta completa (upload + análisis mock).

El gating se aplica en server (qué se renderiza) — no hay mutaciones ni data
persistida, así que no requiere RLS, audit ni notif. Cuando exista el backend
real de análisis, sumar tabla + action + (probable) cuota por plan.

## 8. Cosas pendientes / TODO

- [ ] Backend real de Coach AI (upload de video, pipeline de análisis, persistencia).
- [ ] Notificación al activarse premium (kind `plan_activated`).
- [ ] Listado público de beneficios premium (hoy es marketing copy hardcoded).
- [ ] UI: badge "X/cap" en TeamHome + banner upgrade contextual al
      chocar el cap (Stage 2 de roadmap teams).
- [ ] Stats split `TeamStatsBasic` vs `TeamStatsAdvanced` (Stage 2).
- [ ] Notif `team_roster_cap_reached` (Stage 3).
- [ ] Tiers superiores (Pro, Elite) — schema lo permite pero no usado.
