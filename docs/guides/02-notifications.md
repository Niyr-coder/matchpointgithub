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
[TopBar bell wiggle + badge pop] (componente <TopBar> escucha un canal
por rol activo y filtra postgres_changes por recipient_user_id=eq.<uid>)
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
| `role_request_new` | roles | admin | `submitRoleRequest` server action | 033 / 20260605130000 | ✅ |
| `role_request_approved` | roles | user/role solicitado | `approveRoleRequest` | 033 | ✅ |
| `role_request_rejected` | roles | user | `rejectRoleRequest` | 033 | ✅ |
| `club_application_new` | clubs | admin | submit de club_application | 033 | ✅ |
| `club_application_approved` | clubs | applicant + owner | `quickApproveApplication` | 033 | ✅ |
| `club_application_rejected` | clubs | applicant | `rejectApplication` | 033 | ✅ |
| `club_application_status` | clubs | applicant | cambio de fase de revisión | 033 | ✅ |
| `reservation_created` | reservations | user | createReservation | 033 | ✅ |
| `reservation_cancelled` | reservations | user | cancelReservation | 033 | ✅ |
| `ticket_new` | support | admin | submit ticket de soporte | 033 | ✅ |
| `ticket_assigned` | support | admin asignado | admin asigna ticket | 033 | ✅ |
| `ticket_status_changed` | support | user dueño del ticket | cambio real a `in_progress`, `waiting_user`, `resolved` o `closed` | 20260531042315 | ✅ |
| `friend_request_new` | social | user destino | sendFriendRequest | 033 | ✅ |
| `event_rescheduled` | events | user inscrito | updateEventAdmin con cambio de fechas | 045 | ✅ |
| `event_registration_cancelled` | events | user inscrito | `removeEventRegistrationAdmin` | 20260530232000 | ✅ |
| `event_registration_transferred` | events | user origen + destino | `transferEventSlotAdmin` | 20260530232000 | ✅ |
| `event_registration_no_show` | events | user inscrito | `markEventNoShowAdmin` | 20260530232000 | ✅ |
| `tournament_rescheduled` | tournaments | jugadores pending+accepted | `updateTournamentByOrganizer` con cambio fechas | 045 | ✅ |
| `tournament_cancelled` | tournaments | jugadores pending+accepted | `setTournamentStatus(cancelled)` / `cancelTournament` | 071 | ✅ |
| `registration_accepted` | tournaments | jugadores del registration | `updateRegistrationStatus(accepted)` | 079 | ✅ |
| `registration_rejected` | tournaments | jugadores del registration | `updateRegistrationStatus(rejected)` | 079 | ✅ |
| `tournament_registration_removed` | tournaments | jugadores del registration | `removeTournamentRegistrationAdmin` | 20260530232000 | ✅ |
| `payment_proof_rejected` | pagos | customer_user_id de la tx | `rejectPaymentProofAdmin` | 079 | ✅ |
| `plan_expiring_soon` | (sin categoría custom) | user con sub que vence ≤7d | cron diario `notify-expiring-plans` (mig 049) | 050 | ✅ |
| `match_seek_applied` | matches | autor del aviso | `applyToMatchSeek` | 119 | ✅ |
| `match_seek_accepted` | matches | postulante aceptado | `acceptApplicant` | 119 | ✅ |
| `match_cancelled` | matches | resto de participantes | `cancelMatch` | 122 | ✅ |
| `match_rescheduled` | matches | resto de participantes | `rescheduleMatch` | 122 | ✅ |
| `match_no_show_reported` | matches | jugador reportado | `reportNoShow` (flag) | 124 | ✅ |
| `team_member_kicked` | teams | jugador expulsado | `kickTeamMember` (capitán) | 125 | ✅ |
| `team_member_joined` | teams | capitán | `requestJoinTeam` auto-accept (mig 164) | 164 | ✅ |
| `team_achievement_awarded` | teams | capitán | `grantTeamAchievement` (admin) | 164 | ✅ |
| `team_reported` | moderation | admins | `reportTeam` (cualquier user) | 166 | ✅ |
| `team_report_resolved` | moderation | reporter | `resolveTeamReport` (admin) | 166 | ✅ |
| `team_suspended` | teams | miembros | `setTeamStatusAdmin` (admin) | 166 | ✅ |
| `team_archived` | teams | miembros | `setTeamStatusAdmin` (admin) | 166 | ✅ |
| `team_reactivated` | teams | miembros | `setTeamStatusAdmin` (admin) | 166 | ✅ |
| `team_dissolved_by_admin` | teams | miembros | `adminDissolveTeam` (admin) | 166 | ✅ |
| `team_admin_message` | teams | capitán(es) | `sendAdminDmToCaptain` / `bulkAdminDmToCaptains` | 166 | ✅ |
| `quedada_payment_reminder` | quedadas | inscrito con `paid=false` | `remindQuedadaPayment` (organizador/co-host) | 145 | ✅ |
| `quedada_rescheduled` | social | inscritos `joined` | `updateQuedadaDetails` con cambio de `starts_at` | 146 | ✅ |
| `club_membership_requested` | clubs | owner/manager del club | `requestClubMembership` (usuario compra) | 148 | ✅ |
| `club_membership_activated` | clubs | usuario | `approveClubMembership` (club aprueba pago) | 148 | ✅ |
| `club_membership_expiring_soon` | clubs | usuario | cron `process-club-memberships-daily` (≤7d) | 148 | ✅ |
| `club_staff_assigned` | roles | manager/coach/employee asignado | `assignRole` (owner agrega staff) | 165 | ✅ |
| `club_staff_removed` | roles | manager/coach/employee removido | `revokeRole` (owner quita staff) | 165 | ✅ |
| `broadcast` | marketing | usuarios del segmento | `dispatchBroadcast` admin | 176 | ✅ |
| `payment_captured` | pagos | customer_user_id de la tx | `approvePaymentProofAdmin` | 176 | ✅ |
| `mp_plus_activated` | premium | user | `approvePlanSubscriptionAdmin` / `grantMatchPointPlusAdmin` | 176 | ✅ |
| `mp_plus_revoked` | premium | user | `revokeMatchPointPlusAdmin` | 176 | ✅ |
| `refund_completed` | pagos | customer_user_id de la tx | `markTransactionRefundedAdmin` | 176 | ✅ |
| `report_resolved` | moderation | reporter | `actOnReport` | 176 | ✅ |
| `role_assigned` | roles | usuario afectado | `assignRole` admin | 176 | ✅ |
| `role_revoked` | roles | usuario afectado | `revokeRole` admin | 176 | ✅ |
| `welcome_owner` | clubs | owner recién aprobado | `quickApproveApplication` / `approveApplication` | 176 | ✅ |
| `tournament_published` | tournaments | partner org | `setTournamentStatus(registration_open)` | 20260605130000 | ✅ |
| `tournament_finished` | tournaments | jugadores pending+accepted | `setTournamentStatus(finished)` | 20260605130000 | ✅ |
| `tournament_registration_new` | tournaments | partner org | `registerToTournament` | 20260605130000 | ✅ |
| `payout_paid` | pagos | owner del club / partner | `markPayoutPaid` | 20260605130000 | ✅ |
| `club_reservation_new` | reservations | owner/manager del club | `createReservation` | 20260605130000 | ✅ |
| `club_featuring_activated` | clubs | owner del club | `approveClubFeaturingAdmin` | 20260605130000 | ✅ |
| `quedada_reminder` | quedadas | inscritos `joined` | cron `process-quedada-reminders-hourly` | 20260605130000 | ✅ |
| `match_result_reported` | matches | resto de participantes | `reportScore` | 20260605130000 | ✅ |
| `match_incident_reported` | tournaments | partner org del torneo | `reportMatchIncident` | 20260630100000 | ✅ |
| `tournament_match_ready` | tournaments | jugadores del partido listo | `generateBracket` / `generateKnockoutFromGroups` / avances en `reportBracketMatch`·`correctBracketMatch`·`confirmBracketMatch` / `drawTournamentGroups` (1 por jugador) — helper `notifyMatchReady`/`notifyGroupsDrawn` | 20260710010000 | ✅ |
| `refund_requested` | pagos | staff del organizador (partner org o club) | `cancelMyRegistration` (tx captured) / `setTournamentStatus→cancelled` (bulk, 1 notif agregada) — helper `notifyRefundRequested` | 20260712000000 | ✅ |

## 2.1 Checklist de cobertura (audit 2026-05)

Usa esta tabla para QA rápido por rol. **Dispatcher** = branch en
`fn_dispatch_inapp_notifications`. **Deep-link** = `hrefForKind` en
`NotificationsPanel.tsx`.

| Kind | Dispatcher | Deep-link panel | Disparador cableado | Notas |
|---|---|---|---|---|
| `role_request_new` | ✅ | ✅ admin | ✅ `submitRoleRequest` | — |
| `role_request_approved/rejected` | ✅ | ✅ | ✅ | `recipient_role` = rol solicitado |
| `role_assigned/revoked` | ✅ | ✅ | ✅ | `recipient_role` = rol asignado |
| `club_application_*` | ✅ | ✅ | ✅ | — |
| `friend_request_*` | ✅ | ✅ | ✅ | — |
| `ticket_new/assigned/status_changed` | ✅ | ✅ | ✅ | — |
| `reservation_*` | ✅ | ✅ | ✅ | incluye check-in / no-show |
| `club_reservation_new` | ✅ | ✅ owner/manager | ✅ | — |
| `quedada_*` | ✅ | ✅ | ✅ | reminder vía cron horario |
| `club_featuring_*` | ✅ | ✅ | ✅ activado + expiring cron | — |
| `match_seek_*` | ✅ | ✅ | ✅ vía `notify()` | — |
| `match_challenge_*` | ✅ | ⚠️ retos | ✅ | — |
| `tournament_published/finished` | ✅ | ✅ partner/user | ✅ | — |
| `tournament_registration_new` | ✅ | ✅ partner | ✅ | — |
| `registration_accepted/rejected` | ✅ | ✅ | ✅ vía `notify()` | — |
| `tournament_cancelled` | ✅ | ✅ | ✅ vía `notify()` | — |
| `payout_paid` | ✅ | ✅ | ✅ | — |
| `payment_captured/proof_rejected` | ✅ | ✅ | ✅ reject vía `notify()` | — |
| `match_result_reported` | ✅ | ✅ | ✅ `reportScore` | — |
| `team_roster_cap_reached` | ✅ | ✅ | ✅ | — |
| `club_membership_*` | ✅ | ✅ | ✅ + cron | — |
| `broadcast/mp_plus_*` | ✅ | ✅ | ✅ | — |

**Pendiente cross-canal (no bloquea in-app):** email para críticas, push
(service worker), `match_result_reported` en server action de scoring.

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
- `TopBar.tsx` se suscribe a un canal por rol activo:
  `mp:user:<uid>:role:<role>:notifications`
- El `postgres_changes` usa filter `recipient_user_id=eq.<uid>` event `*` y
  el handler descarta eventos cuyo `recipient_role` no coincide con el rol
  activo. RLS sigue protegiendo cross-user; este guard evita refrescos y badge
  por notificaciones de otro rol del mismo usuario.
- Pendiente DB si se quiere aislamiento estricto por rol en el stream: hacer
  que la conexión Realtime tenga `app.active_role` confiable o ajustar la
  política de `notifications` sin romper clientes existentes. No resolver con
  hacks de cliente: el guard actual es solo reactividad/UX.
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
   de encolar. El path admin `markTournamentRegistrationStatusAdmin` rechaza
   mismo status antes de encolar. Sin eso, repintar el botón = spam de notifs.
4. **`payment_proof_rejected` necesita el `proof_rejection_reason`** en el
   payload o el body cae al genérico. Ya lo pasa `rejectPaymentProofAdmin`.
5. **Eventos admin no deben duplicar cambios terminales** —
   `removeEventRegistrationAdmin` no corre sobre canceladas y
   `markEventNoShowAdmin` rechaza inscripciones ya `no_show`.
6. **El cron dispatcher corre cada 5 min** — para testing manual:
   `select fn_dispatch_inapp_notifications();` desde la SQL console de
   Supabase. Procesa hasta 500 jobs por corrida.
7. **`ticket_assigned` es best-effort desde `assignTicket`** — al asignar un
   ticket se encola notif al admin destino. No manda DM de sistema porque es
   una alerta operativa puntual, no conversación persistente.
8. **`ticket_status_changed` va al dueño del ticket** — se encola solo si el
   status realmente cambia. No manda DM del sistema: el cambio de estado es
   alerta puntual con deep-link a `/dashboard/user/soporte`; no abre una
   conversación nueva ni requiere historial conversacional.

## 7. Canales

`notification_kinds.default_channels` es array de `mp_notification_channel`
(`inapp | email | push | sms`). Estado real:

| Canal | Estado | Qué existe | Qué falta |
|---|---|---|---|
| `inapp` | Activo | `fn_enqueue_notification`, `fn_dispatch_inapp_notifications()`, tabla `notifications`, realtime en TopBar y panel de campana. | Mantener branch del dispatcher por cada kind nuevo. |
| `email` | Preparado / parcial | Cron HTTP `/api/cron/dispatch-email`, Resend vía `RESEND_API_KEY`, `EMAIL_FROM`, preferencias por kind/canal y plantillas en `src/lib/notifications/email-templates.ts`. | Programar el cron en el entorno, definir env vars server-only y agregar plantillas explícitas para cada kind que se quiera enviar por email. Los kinds sin plantilla se marcan `skipped`, no envían payload crudo. |
| `push` | Pendiente | Enum, tabla `notification_subscriptions` y preferencias modeladas. Hay `manifest.webmanifest` básico para metadata PWA. | Service worker, registro/opt-in en cliente, VAPID keys, endpoint de suscripciones, dispatcher Web Push y QA en navegadores reales. |
| `sms` | Pendiente | Valor del enum usado solo por algunas configuraciones de club. | Proveedor, costos, consentimiento, plantillas y dispatcher. |

### 7.1 Preferencias por tipo/canal

`notification_preferences` guarda overrides por usuario, rol, kind y canal:

- No tener fila significa **usar el default seguro** del catálogo: solo se
  considera habilitado si el canal está en `notification_kinds.default_channels`.
- `enabled=false` bloquea ese `kind + channel` para ese `user + role`.
- `fn_enqueue_notification` respeta la preferencia antes de crear la fila
  `notifications` para `inapp` o de encolar jobs de `email`/`push`.
- `fn_dispatch_inapp_notifications()` vuelve a chequear la preferencia antes
  de materializar jobs insertados directo en `notification_jobs`.
- El cron `dispatch-email` también marca como `skipped` los jobs `email`
  desactivados antes de resolver correo o llamar a Resend.

### 7.2 Email transaccional

El dispatcher de email no activa env faltantes:

- Sin `CRON_SECRET`, `/api/cron/dispatch-email` responde 401.
- Sin `RESEND_API_KEY`, los jobs `email` quedan `skipped` con
  `last_error="RESEND_API_KEY missing"`.
- Con `RESEND_API_KEY`, antes de enviar vuelve a validar preferencias y que el
  canal esté en `notification_kinds.default_channels`.
- Si el kind no tiene plantilla en `renderEmail()`, el job queda `skipped` con
  `last_error="sin plantilla de email para <kind>"`.

Si necesitas email para alguna notif crítica (ej. `tournament_cancelled`):
1. Agregar `'email'` al `default_channels` del kind.
2. Implementar branch en `renderEmail(kind, payload)` dentro de
   `src/lib/notifications/email-templates.ts`.
3. Asegurar que el caller use `fn_enqueue_notification` / `notify()`; si inserta
   jobs directo en `notification_jobs`, debe crear también el job `email`.

### 7.3 Readiness checklist para push

No implementar push real hasta completar esta base:

- [ ] `public/manifest.webmanifest` con nombre, scope, display e íconos.
- [ ] Service worker versionado que maneje `push` y `notificationclick`.
- [ ] VAPID keys server-only (`VAPID_PRIVATE_KEY`) y public key expuesta solo si
  se usa para `PushManager.subscribe()`.
- [ ] Endpoint autenticado para crear/revocar subscriptions en
  `notification_subscriptions`.
- [ ] UI de opt-in con copy claro de “próximamente” mientras el dispatcher no
  esté activo.
- [ ] Worker/cron de entrega Web Push que respete `notification_preferences`.
- [ ] QA en Chrome/Edge desktop y Android; fallback claro en iOS si aplica.

## 8. System messages (DMs del perfil oficial "MATCHPOINT")

Distinto del catálogo de notifs: estos son **mensajes reales** en la tabla
`messages`, enviados desde el perfil `is_system=true` que vive en
`profiles`. Aparecen en `/dashboard/user/chat` con badge verified y pin
top en la lista de conversaciones.

**Estado P2-D**:
- El DM oficial MATCHPOINT es **read-only para usuarios**. No hay composer en
  la UI y `sendMessage()` bloquea envíos si la conversación incluye un perfil
  `is_system=true`.
- No se debe prometer soporte por este DM mientras no exista moderación,
  asignación o SLA claro. Para soporte, dirigir al usuario a la sección
  Soporte.

**Cuándo se disparan**:
- `welcome_signup` — al `signUp` server action.
- `welcome_team_created` — al `createTeam`.
- `welcome_onboarding_completed` — al `saveOnboardingStep(step='finish')`.
- `welcome_premium_activated` — al `approvePlanSubscriptionAdmin`.
- `quedada_payment_reminder` — al `remindQuedadaPayment` (dual-channel: además
  de la notif inapp, manda un DM del sistema con los datos de transferencia).

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
  pero hoy no permite respuesta del usuario.
- Notification: alerta puntual, ephemeral, badge en bell, click → URL.

## 9. TODOs

- [x] Notif `tournament_published` (al pasar de draft → registration_open)
- [x] Notif `tournament_finished`
- [x] Notif `payment_captured` (al aprobar pago)
- [x] Notif `match_result_reported` (`reportScore` → resto de participantes)
- [x] Notif `payout_paid` (al partner/club cuando MP les paga)
- [x] Cron `quedada_reminder` (24h antes, dedup por participante)
- [x] Branches dispatcher para kinds legacy sin link (friends, tickets, quedadas, etc.)
- [x] `submitRoleRequest` + `role_request_new` a admins
- [x] Deep-links ampliados en `NotificationsPanel`
- [ ] Email channel para notifs críticas (rescheduled, cancelled, refund)
- [ ] Push notifications (service worker + opt-in + dispatcher Web Push)
- [x] Base de settings para que el user elija qué notifs recibir y por qué canal
