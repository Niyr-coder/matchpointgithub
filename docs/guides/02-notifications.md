# Notificaciones

> Catálogo completo de `notification_kinds`. Cada vez que agregues una notif
> nueva: (1) seed en migration, (2) branch en dispatcher, (3) action que la
> encole, (4) agregar fila aquí. Si saltas un paso, la notif queda en la
> tabla pero nunca llega al usuario.

## 1. Arquitectura

```
[Server action muta DB]
     │
     ▼
{ INSERT notification_jobs (status='pending', channel='inapp', kind, payload, user_id) }
     │
     ▼
[Cron supabase cada 5 min: select public.fn_dispatch_inapp_notifications()]
     │
     ▼
[Función itera jobs pending, derivá title/body/link según `kind`]
     │
     ▼
{ INSERT notifications (recipient_user_id, kind, title, body, link, delivered_at) }
     │
     ▼
[UPDATE notification_jobs status='sent']
     │
     ▼
≈ realtime publication notifications ≈
     │
     ▼
[TopBar bell wiggle + badge pop] (componente <TopBar> escucha
postgres_changes filtrado por recipient_user_id=eq.<uid>)
```

Tablas:
- `notification_kinds` — catálogo (kind, description, allowed_roles, default_channels, category)
- `notification_jobs` — cola pending → sent/failed
- `notifications` — entregadas, las que el user lee en la UI

Dispatcher: `public.fn_dispatch_inapp_notifications()` (PL/pgSQL,
SECURITY DEFINER, idempotente). Definida originalmente en mig **050**,
recreada incrementalmente al agregar kinds nuevos (072, 079).

## 2. Catálogo completo

| Kind | Categoría | Recipient | Disparador | Migration | Estado |
|---|---|---|---|---|---|
| `role_request_new` | roles | admin | `requestRole` server action | 033 | ✅ |
| `role_request_approved` | roles | user/role solicitado | `approveRoleRequest` | 033 | ✅ |
| `role_request_rejected` | roles | user | `rejectRoleRequest` | 033 | ✅ |
| `club_application_new` | clubs | admin | submit de club_application | 033 | ✅ |
| `club_application_approved` | clubs | applicant + owner | `quickApproveApplication` | 033 | ✅ |
| `club_application_rejected` | clubs | applicant | `rejectApplication` | 033 | ✅ |
| `club_application_status` | clubs | applicant | cambio de fase de revisión | 033 | ⚠️ no disparada hoy |
| `reservation_created` | reservations | user | createReservation | 033 | ✅ |
| `reservation_cancelled` | reservations | user | cancelReservation | 033 | ✅ |
| `ticket_new` | support | admin | submit ticket de soporte | 033 | ✅ |
| `ticket_assigned` | support | admin asignado | admin asigna ticket | 033 | ✅ |
| `friend_request_new` | social | user destino | sendFriendRequest | 033 | ✅ |
| `event_rescheduled` | events | user inscrito | updateEventAdmin con cambio de fechas | 045 | ✅ |
| `tournament_rescheduled` | tournaments | jugadores pending+accepted | `updateTournamentByOrganizer` con cambio fechas | 045 | ✅ |
| `tournament_cancelled` | tournaments | jugadores pending+accepted | `setTournamentStatus(cancelled)` / `cancelTournament` | 071 | ✅ |
| `registration_accepted` | tournaments | jugadores del registration | `updateRegistrationStatus(accepted)` | 079 | ✅ |
| `registration_rejected` | tournaments | jugadores del registration | `updateRegistrationStatus(rejected)` | 079 | ✅ |
| `payment_proof_rejected` | pagos | customer_user_id de la tx | `rejectPaymentProofAdmin` | 079 | ✅ |
| `plan_expiring_soon` | (sin categoría custom) | user con sub que vence ≤7d | cron diario `notify-expiring-plans` (mig 049) | 050 | ✅ |
| `match_seek_applied` | matches | autor del aviso | `applyToMatchSeek` | 119 | ✅ |
| `match_seek_accepted` | matches | postulante aceptado | `acceptApplicant` | 119 | ✅ |
| `match_cancelled` | matches | resto de participantes | `cancelMatch` | 122 | ✅ |
| `match_rescheduled` | matches | resto de participantes | `rescheduleMatch` | 122 | ✅ |
| `match_no_show_reported` | matches | jugador reportado | `reportNoShow` (flag) | 124 | ✅ |
| `team_member_kicked` | teams | jugador expulsado | `kickTeamMember` (capitán) | 125 | ✅ |

## 3. Render del dispatcher (cómo derivá title/body/link)

Ejemplo del branch `tournament_cancelled`:

```sql
elsif _kind = 'tournament_cancelled' then
  if _title is null then _title := 'Tu torneo fue cancelado'; end if;
  if _body is null then
    _body := coalesce(_payload->>'tournament_name', 'Un torneo')
          || ' fue cancelado por el organizador. Si pagaste cuota, te será devuelta.';
  end if;
  if _payload ? 'tournament_id' then
    _link := '/eventos/' || coalesce(_payload->>'tournament_slug', _payload->>'tournament_id');
  end if;
```

**Reglas del payload**:
- Si el caller incluye `title`/`body` en el payload, **se respetan** (override).
- Sin override, el branch usa templates con datos del payload (
  `tournament_name`, `days_remaining`, etc).
- El `link` se arma con slug si está, sino con id.

## 4. Cómo agregar una notif nueva

1. **Migration nueva** que (a) seedee el kind en `notification_kinds`,
   (b) recree `fn_dispatch_inapp_notifications` con el branch nuevo.
   Usá `on conflict do nothing` para idempotencia.

```sql
insert into notification_kinds (kind, description, allowed_roles, default_channels, category)
values (
  'mi_nueva_notif',
  'Descripción legible',
  array['user']::mp_role[],
  array['inapp']::mp_notification_channel[],
  'mi_categoria'
)
on conflict (kind) do nothing;

create or replace function public.fn_dispatch_inapp_notifications()
returns integer language plpgsql security definer set search_path = public
as $$
-- ... pegar el body completo + agregar el branch nuevo en el lugar correcto.
$$;
```

2. **Encolar en server action** que dispara el evento. Patrón:

```ts
const admin = getAdminClient();
const { error: jobErr } = await admin
  .from("notification_jobs")
  .insert({
    user_id: recipientUid,
    role: "user",
    kind: "mi_nueva_notif",
    channel: "inapp",
    payload: { ...datos_para_template },
    status: "pending",
  } as never);
if (jobErr) console.error("[mi_action] enqueue notif failed:", jobErr.message);
// Best-effort: si falla la notif, la mutación principal sigue OK.
```

3. **Actualizar la tabla de §2** aquí con el nuevo kind.

## 5. Realtime + reactivity

- Tabla `notifications` está en publication `supabase_realtime` (mig 061).
- `TopBar.tsx` se suscribe a:
  `postgres_changes` filter `recipient_user_id=eq.<uid>` event `*`
- Al recibir un evento dispara `refresh()` que re-fetcha el badge count +
  bell wiggle + badge pulse.

## 6. Bugs históricos / cosas a recordar

1. **No olvidar el branch del dispatcher** — sin él, el job se inserta pero
   `notifications` queda con title=`<kind>` y body=`<payload serializado>`
   (fallback feo).
2. **`tournament_cancelled` dispara desde 2 actions** — `setTournamentStatus`
   y `cancelTournament`. La segunda delega en la primera. NO disparar la
   notif desde otras actions o se duplica.
3. **`registration_accepted/rejected` solo cuando hay cambio real** —
   `updateRegistrationStatus` chequea `previousStatus !== newStatus` antes
   de encolar. Sin eso, repintar el botón = spam de notifs.
4. **`payment_proof_rejected` necesita el `proof_rejection_reason`** en el
   payload o el body cae al genérico. Ya lo pasa `rejectPaymentProofAdmin`.
5. **El cron dispatcher corre cada 5 min** — para testing manual:
   `select fn_dispatch_inapp_notifications();` desde la SQL console de
   Supabase. Procesa hasta 500 jobs por corrida.

## 7. Canales

`notification_kinds.default_channels` es array de `mp_notification_channel`
(`inapp | email | push`). Hoy **solo `inapp` está implementado**. El
dispatcher de email existe pero está dormido (`src/lib/notifications/email-templates.ts`
+ cron `dispatch-email`). Push notifications no están armadas.

Si necesitas email para alguna notif crítica (ej. `tournament_cancelled`):
1. Agregar `'email'` al `default_channels` del kind.
2. Implementar branch en `dispatchEmailFor(kind, payload)` (no existe hoy).
3. Encolar también `channel='email'` en notification_jobs aparte del inapp.

## 8. System messages (DMs del perfil oficial "MATCHPOINT")

Distinto del catálogo de notifs: estos son **mensajes reales** en la tabla
`messages`, enviados desde el perfil `is_system=true` que vive en
`profiles`. Aparecen en `/dashboard/user/chat` con badge verified y pin
top en la lista de conversaciones.

**Cuándo se disparan** (4 momentos hoy):
- `welcome_signup` — al `signUp` server action.
- `welcome_team_created` — al `createTeam`.
- `welcome_onboarding_completed` — al `saveOnboardingStep(step='finish')`.
- `welcome_premium_activated` — al `approvePlanSubscriptionAdmin`.

**Cómo funciona**:
- RPC `fn_send_system_message(recipient_user_id, body, payload)` (mig 105).
- Helper TS `sendSystemMessage()` en `src/lib/messages/system.ts`.
- Templates hardcoded en `WELCOME_TEMPLATES` (placeholder pendiente — ver
  `04-placeholders.md`).
- Killswitch `platform_config.system_messages_enabled` (default `true`).

**Diferencia con notification_kinds**:
- Notification = entry en tabla `notifications` + bell badge en TopBar.
- System message = entry en tabla `messages` + aparece en /chat como DM.
- El insertarse un message del system user, el realtime de TopBar bell
  NO se dispara (el bell escucha `notifications`, no `messages`). El
  unread del chat sí se incrementa vía el RPC `fn_unread_messages_count`
  (mig 100).

**Para agregar un kind nuevo** (ej. `welcome_first_reservation`):
1. Agregar el kind a `SystemMessageKind` en `src/lib/messages/system.ts`.
2. Agregar template a `WELCOME_TEMPLATES`.
3. Llamar `sendSystemMessage({ kind, ... })` desde la server action
   relevante.
4. (NO toca `notification_kinds` — system messages no pasan por ahí).

**Cuándo usar system message vs notification**:
- System message: comunicación rica, conversacional, mantiene historial,
  permite respuesta futura del user (cuando habilitemos respuestas).
- Notification: alerta puntual, ephemeral, badge en bell, click → URL.

## 9. TODOs

- [ ] Notif `tournament_published` (al pasar de draft → registration_open)
- [ ] Notif `tournament_finished`
- [ ] Notif `payment_captured` (al aprobar pago)
- [ ] Notif `match_result_reported`
- [ ] Notif `payout_paid` (al partner/club cuando MP les paga)
- [ ] Email channel para notifs críticas (rescheduled, cancelled, refund)
- [ ] Push notifications (después de PWA install)
- [ ] Settings para que el user elija qué notifs recibir y por qué canal
