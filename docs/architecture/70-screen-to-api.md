# 70 · Conexión Pantalla ↔ API ↔ DB

Este documento es la **vista invertida** de `10-domains.md`: en vez de partir del dominio, parte de cada pantalla y traza el flujo completo hasta la DB y de vuelta. Sirve para responder dos preguntas:

> *"Si toco esto, ¿qué se actualiza en X?"*
> *"¿Por qué cuando hago Y en la pantalla A, se ve también en la pantalla B?"*

## 0. Cómo leer este doc

Cada flujo se anota así:

```
[Pantalla / Componente]
  ↓ READ
  Server Component fetches: <action o query>
    → Tablas DB: <listado>
  Client Component renders + subscribes:
    Realtime: <[tablas suscritas]>
  ↓ ACTION (click)
  <Server Action invoked>
    → INSERT/UPDATE/DELETE en <tablas>
    → Triggers / cascade: <efectos secundarios>
  ↓ DOWNSTREAM
  Pantallas que también ven el cambio (vía realtime o re-fetch):
    - <pantalla 1>
    - <pantalla 2>
```

## 1. Patrón general (todas las pantallas)

```
URL → Next.js Server Component (Screen.tsx)
        → invoca server actions o queries Supabase directo
        → entrega ViewModel a ScreenView.tsx (Client Component)
            → useRealtimeRefresh([tablas que afectan esta vista])
            → al click: server action (en otro file con "use server")
                → mutación DB (respeta RLS)
                → router.refresh() optimístico
                → realtime fanout: cualquier otra pantalla suscrita re-renderiza
```

Reglas clave del proyecto:
- **Server Components** hacen TODOS los reads (incluso si parecen "live") — son re-fetcheables vía `router.refresh()`.
- **Realtime** se usa SOLO para invalidar caché de React Router (`router.refresh()` con debounce 300ms), no para mutar state local del cliente.
- **Server Actions** son la única vía de write. Nada de `supabase.from(...).insert(...)` en cliente.
- Para evitar gaps cross-domain ver `50-realtime.md §8.1`.

---

## 2. Dominio · `auth` & `identity`

### `/login` y `/signup`
```
READ: ninguno (renderizan formularios)
ACTION (submit):
  signInFromForm / signUpFromForm (actions/auth.ts)
    → supabase.auth.signInWithPassword | signUp
    → trigger tg_handle_new_auth_user crea row en `profiles` + `role_assignments` (rol "user")
  → redirect a /dashboard
DOWNSTREAM:
  - cookies de session (httpOnly) → proxy middleware permite acceso a /dashboard/*
```

### `/dashboard/[role]` layout
```
READ:
  getSession + supabase.from("role_assignments").select("role,club_id,...")
    → tablas: profiles, role_assignments, clubs, partner_orgs
  Decide si el user puede ver ese rol; si no → redirect a uno permitido
```

### `OnboardingWizard` (overlay sobre /dashboard/user)
```
READ (server side en UserHome):
  profiles.onboarded_at, profiles.city
ACTION:
  completeOnboarding({ city?, preferredSport?, skillLevel? })  [actions/me.ts]
    → UPDATE profiles SET onboarded_at = now(), city = X, preferred_sport = Y, skill_level = Z
  → router.refresh() → UserHomeView ya no muestra wizard
```

---

## 3. Dominio · `clubs` & `club-applications`

### `/user/solicitar-club` — wizard 5 pasos + Submitted/Approved/Rejected
```
READ:
  getMyApplication + getApplicationDetail
    → tablas: club_applications, club_application_courts,
              club_application_documents, club_application_photos,
              club_application_events
  El loader (SolicitarClubScreen.tsx) calcula:
    - status real → vista a mostrar (steps 1-5 | submitted | rejected | approved)
    - review snapshot (submittedAt, approvedAt, reviewerNotes, rejectionReason)
    - approvedClub.checklist (hasCourts, hasPricing, hasLogo, hasCover)
      → query a courts + court_pricing + clubs

ACTION (Steps 1-5):
  updateApplication({ step, data }), addApplicationCourt, uploadApplicationDocument,
  uploadApplicationPhoto, submitClubApplication
    → UPDATE club_applications / INSERT en sub-tablas
    → trigger fn_log_application_event escribe en club_application_events

ACTION admin-side (no en /user/solicitar-club, sino en /admin/admin-clubs):
  startDocsReview, scheduleFieldVerification, startFinalReview,
  approveClubApplication, rejectClubApplication, addReviewerNote
    → UPDATE club_applications.status + timestamps + reviewer_notes
    → si approve: ejecuta fn_materialize_club_from_application
      → INSERT en clubs + courts + court_pricing
      → INSERT en role_assignments (rol owner para el applicant)
      → UPDATE club_applications.resulting_club_id

REALTIME:
  /user/solicitar-club suscribe a { table: "club_applications" }
    (RLS limita filas al applicant_id = auth.uid())
  → cuando admin avanza el pipeline, el user ve actualizado SubmittedView
    sin recargar (timeline cambia de "wait" a "now" a "done")

DOWNSTREAM al approve:
  - /dashboard/owner ahora accesible (role_assignments tiene owner)
  - /clubes/[slug] página pública muestra el club (status=active)
  - /user/clubes incluye el club en listFeaturedClubs
  - El user que ya ve /user/solicitar-club se mueve a ApprovedView automáticamente
```

### `/owner/club-config` — Identidad visual + sections
```
READ:
  loadData → clubs, club_settings, courts, court_pricing
ACTION:
  Texto: updateClub({ clubId, patch: { name|address|phone|email|... } })
  Imágenes: ImageUploader sube a bucket `clubs` (path {clubId}/...) vía RLS
    → callback persistClubAsset → updateClub({ patch: { logoUrl | coverUrl } })
DOWNSTREAM:
  - /user/clubes tarjetas muestran logo/cover nuevos (listFeaturedClubs lee `clubs_public_summary`)
  - /clubes/[slug] página pública actualizada
  - Tickets, reseñas y cards de chat que muestran logo del club
```

### `/clubes/[slug]` (público) y `/user/clubes`
```
READ:
  getClub + listClubReviews + getClubReviewStats (bulk RPC)
    → tablas: clubs, club_settings, club_amenities, club_photos,
              club_reviews, profiles (autor de cada review)
ACTION (en /clubes/[slug]):
  createClubReview({ clubId, rating, comment? })
    → INSERT/UPSERT en club_reviews (unique by club_id, user_id, reservation_id)
DOWNSTREAM:
  - /user/clubes refresca el rating promedio (get_club_review_stats RPC)
  - /clubes/[slug] muestra la nueva review en la lista
```

---

## 4. Dominio · `reservations`

### `/user/inicio` y `/user/clubes` → modal `ReservarCanchaDrawer`
```
READ (cuando modal monta):
  fetch availability del courtId + fecha → courts, reservations (rango horario)
ACTION:
  createReservation({ courtId, during, sport, ... })
    → INSERT en reservations (RLS: organizer_id = auth.uid())
    → exclusion constraint GIST (`court_id`, `during`) previene doble booking
    → trigger inserta en reservation_payments si method != "cash"
    → INSERT en transactions (kind="reservation", status="captured" o "pending")
REALTIME:
  /owner/club-reservas, /employee/e-reservas, /manager/club-reservas
    suscriben a { table: "reservations", filter: `club_id=eq.{clubId}` }
  /user/inicio (UserHome) suscribe a { table: "reservations", filter: `organizer_id=eq.{userId}` }
DOWNSTREAM al insert:
  - Card "Próxima reserva" del user se actualiza en vivo
  - Calendario de staff muestra la nueva reserva
  - /owner/club-finanzas suma la transaction en KPIs (realtime sobre transactions)
```

### Cancelar
```
ACTION:
  cancelReservation({ id })
    → UPDATE reservations SET status='cancelled'
    → según política, refund automático via processRefund
DOWNSTREAM:
  - Mismas pantallas que createReservation reciben el update
```

---

## 5. Dominio · `teams`

### `/user/team` — Empty / Create / Join / Settings / Invite / Home
```
READ:
  loadTeam → primera membership del user (team_members) + teams + team_invites (pending) + player_stats
  loadPublicTeams → teams con privacy in (public, invite) excluyendo donde ya soy miembro
  loadFriends → listMyFriends (friendships + profiles)

ACTION (Create):
  createTeam({ name, slug, description, sport })
    → INSERT clubs + INSERT team_members(role=captain)
ACTION (Join):
  joinTeamByCode({ code })
    → SELECT teams WHERE invite_code = upper(code) → INSERT team_members(role=player)
ACTION (Settings):
  updateTeam({ patch: { name?, description? } })
  leaveTeam({ teamId })       → DELETE team_members (RLS tm_self_leave)
  disbandTeam({ teamId })     → DELETE teams (cascade a members + invites)
  transferCaptain({ teamId, newCaptainUserId })
    → RPC transfer_team_captain (SECURITY DEFINER bypass de policy WITH CHECK)
ACTION (Invite tab):
  inviteToTeam({ teamId, body: { userId } }) → INSERT team_invites
  cancelInvite({ inviteId }) → UPDATE team_invites SET status='cancelled' (RLS ti_captain_manage migration 036)
  requestJoinTeam({ teamId }) (lado del visitante, no del captain)

REALTIME:
  Suscribe a [teams, team_members, team_invites, team_join_requests] (filtrados por el user/team activo)

DOWNSTREAM:
  - Al crear team, el user pasa de TeamEmpty a TeamHome con router.refresh
  - Al cancelar/aceptar invitación, /user/team y la pestaña Invite se sincronizan
  - Cambios en team se reflejan en perfiles de amigos que ven mis teams (futuro)
```

---

## 6. Dominio · `messaging`

### `/user/mensajes`
```
READ:
  loadData → conversations + conversation_members + messages (60 últimos) + profiles del otro user
  Por cada conv: COUNT messages WHERE created_at > last_read_message_id AND sender_id != me
    → unreadCount real (no hardcoded)

ACTION (enviar mensaje):
  sendMessage({ id, body: { body, kind } })
    → INSERT messages (RLS: solo miembros activos)
    → trigger actualiza conversations.last_message_at
ACTION (marcar leída, auto al abrir conversación):
  markRead({ id, body: { lastMessageId } })
    → UPDATE conversation_members SET last_read_message_id = X
  → router.refresh() → unreadCount del sidebar baja

REALTIME:
  Filtros: messages WHERE conversation_id=eq.{activeConvId}, conversations, conversation_members WHERE user_id=eq.{me}
```

---

## 7. Dominio · `notifications`

### `TopBar` (todos los dashboards) + `NotificationsPanel`
```
READ (TopBar):
  getUnreadCount({ role }) → notifications WHERE recipient_user_id=me AND read_at IS NULL AND role IN ([role, null])
READ (Panel al abrir):
  listMyNotifications({ role, limit: 30 })
ACTION:
  markNotificationRead({ id })       → UPDATE notifications.read_at
  markAllNotificationsRead({ role }) → UPDATE all WHERE recipient_user_id=me AND role IN (...)
  dismissNotification({ id })        → compat pública: UPDATE notifications.read_at
REALTIME:
  TopBar suscribe canal mp:user:{userId}:role:{role}:notifications
  con postgres_changes WHERE recipient_user_id=eq.{userId}
  y descarta eventos cuyo recipient_role no coincide con el rol activo
  → tanto el badge del TopBar como el panel se refrescan automáticamente
PRODUCTORES DE NOTIFICATIONS:
  Múltiples actions disparan fn_enqueue_notification(p_user_id, p_role, p_kind, p_title, ...)
  Ejemplos: createBroadcast, approveClubApplication, accept/declineTeamInvite, etc.
```

### `/dashboard/[role]/notificaciones` — preferencias por tipo/canal
```
READ:
  NotificationPreferencesScreen → listNotificationKinds + listMyPreferences
    → tablas: notification_kinds, notification_preferences
ACTION:
  PATCH /api/v1/me/notification-preferences
    body: { items: [{ role, kind, channel, enabled }] }
    → UPSERT notification_preferences por (user_id, role, kind, channel)
NOTAS:
  - El link vive en el footer del NotificationsPanel ("Preferencias").
  - La pantalla muestra `inapp`, `email` y `push` según default_channels.
  - Email/push se señalan como preparados; no prometen envío real fuera de la app.
```

---

## 8. Dominio · `tournaments`

### `/admin/admin-events` y `/admin/admin-events/[id]` (soporte cross-tenant)
```
READ list:
  AdminEventsScreen → mezcla events + tournaments (ambos no finished/cancelled)
                    + event_registrations + registrations + transactions (mes actual)
                    + clubs (nombre del organizador)
  Filas con prefijo: ev-{uuid} | tr-{uuid} para distinguir en la ruta detail.

READ detail (/admin-events/[id]):
  AdminEventDetail dispatcha por prefijo:
    ev- → getEventForAdmin → event + organizer + registrations (con profiles) + transactions
    tr- → getTournamentForAdmin → tournament + organizer + registrations (con player names) + transactions

ACTION (admin):
  cancelEvent({ eventId, reason? })       → UPDATE events.status='cancelled' (requireAdmin)
  cancelTournament({ tournamentId, reason? }) → UPDATE tournaments.status='cancelled'
  Bloqueos: si status ya es 'cancelled' o 'finished' devuelve error tipado.
  El audit_log se llena vía trigger.

REALTIME:
  Detalle suscribe a { table: "events"|"tournaments" filter id=eq.X },
  { table: "event_registrations"|"registrations" filter X=eq.id },
  { table: "transactions" filter ref_id=eq.id }
  → KPIs y listas se actualizan en vivo cuando cualquier user se inscribe o cancela.

DOWNSTREAM al cancel:
  - /user/eventos deja de mostrar el evento (filtro excluye status='cancelled')
  - /owner/club-eventos también
  - Listing admin actualiza el badge (debería removerse al refresh)
  - TODO: notificar a inscritos vía fn_enqueue_notification por cada user
```

### `/partner/p-torneos` y `/user/eventos`
```
READ:
  listFeaturedTournaments / getTournament (con categories + bracket)
ACTION (partner/admin):
  createTournament, openRegistrations, closeRegistrations, generateBracket, reportMatchScore
ACTION (user):
  registerToTournament({ tournamentId, categoryId })
    → INSERT registrations
DOWNSTREAM al register:
  - /user/inicio (UserHomeView) refresca "registrationsCount" del panel de torneos featured
    (suscrito a { table: "registrations" })
  - /partner/p-inscritos lista al nuevo inscrito
  - Notificación al organizador
```

---

## 9. Dominio · `proshop`

### `/employee/e-shop` (POS) y `/user/shop`
```
READ:
  listProducts / getProduct
ACTION POS (employee):
  createSale({ clubId, items, method, customer })
    → RPC fn_create_sale (migration 039) atómica:
      → SELECT FOR UPDATE en cada products (lock anti-race)
      → valida stock + activo + currency + club_id + cash_session
      → INSERT transactions + sales + sale_items
      → UPDATE products.stock = stock - qty
      → INSERT inventory_movements (reason='sale')
    → si cualquier paso falla, rollback completo
REALTIME:
  /employee/e-caja suscribe a transactions del club
  /owner/club-finanzas también
DOWNSTREAM:
  - Stock visible en /employee/e-shop se decrementa
  - Caja diaria actualizada
  - Inventory_movements visible en auditoría
```

---

## 10. Dominio · `coaches` & `classes`

### `/coach/c-clases` y `/user/academia`
```
READ:
  /coach/c-clases: classes + class_sessions + class_enrollments (mis clases como coach)
  /user/academia: classes públicas + enrollment status del user
ACTION coach:
  createClass, scheduleClassSession (INSERT class_sessions)
ACTION user:
  enrollInClass({ sessionId })
    → INSERT class_enrollments (RLS: solo si capacity > current_count)
    → INSERT transactions si la clase es paga
DOWNSTREAM:
  - /coach/c-alumnos refresca lista (suscrita a class_enrollments del coach)
  - /user/mis-clases muestra la nueva clase
  - /coach/c-pagos suma la transaction
```

### `/owner/club-staff` → `StaffShiftsOverlay` (turnos del staff)
```
READ:
  listShifts({ clubId, userId })
ACTION:
  createShift, deleteShift
    → INSERT/DELETE shifts (exclusion constraint GIST previene solapamientos)
    → error 23P01 mapeado a SHIFTS.OVERLAP
DOWNSTREAM:
  - Coach/employee ve su shift en /coach/c-calendario o equivalente
```

---

## 11. Dominio · `marketing` / `broadcasts`

### `/admin/admin-broadcast` y `/owner/club-marketing`
```
READ:
  listBroadcasts (filtrado por scope) + broadcast_recipients
  broadcast_templates + count profiles (base total de usuarios)
ACTION:
  createBroadcast({ scope, title, body, channels, scheduledFor? })
    → INSERT broadcasts (status="draft" si no scheduledFor, "scheduled" si sí)
  dispatchBroadcast({ id })
    → para envío inmediato: crea recipients + notify() por cada recipient
  setAnnouncementBanner / clearAnnouncementBanner
    → UPSERT/UPDATE announcements (banner global)
  cancelBroadcast({ id })
    → UPDATE broadcasts SET status='cancelled' (solo si era draft o scheduled)
REALTIME:
  Suscribe a broadcasts + broadcast_recipients (para KPIs delivered/opened)
DOWNSTREAM:
  - Cuando dispatchBroadcast procesa: notifications insertadas, el TopBar de cada recipient se actualiza
  - Las campañas scheduled quedan registradas; falta worker/cron de despacho automático
```

---

## 12. Dominio · `walkins` & `caja`

### `/employee/e-walkins` y `/employee/e-checkin` y `/employee/e-caja`
```
READ:
  Walkins activos del club + sesión de caja abierta del employee
ACTION:
  createWalkin → INSERT walkins (status="active")
  removeWalkin → DELETE walkins
  scanQrCheckIn / manualCheckIn → INSERT check_ins
  openCashSession / closeCashSession → INSERT/UPDATE cash_sessions
REALTIME:
  Todas las pantallas del club suscriben a sus tablas relevantes
DOWNSTREAM cross-pantalla:
  - /manager/inicio (ManagerHomeView) suscribe a walkins → ve contador de cola en vivo
  - /owner/club-finanzas suscribe a transactions → ve cash flow del día
```

---

## 13. Dominio · `payouts`

### `/coach/c-pagos` y `/owner/club-finanzas` y `/admin/admin-pagos`
```
READ:
  /coach/c-pagos: transactions WHERE kind='class' AND ref_id IN (mis sessions/lessons)
  /admin/admin-pagos: transactions + refunds + payouts + clubs/profiles/partner_orgs
    + platform_config.take_rate_pct para KPIs de comisión
ACTION (admin):
  processPendingPayouts({ periodStart, periodEnd })
    → para cada club active: SUM transactions captured en el período - commission
    → INSERT payouts (status="processing")
  markPayoutPaid({ id, providerPayoutId })
    → UPDATE payouts SET status='paid', paid_at=now(), provider_payout_id=X
DOWNSTREAM:
  - Coach ve su payout en /coach/c-pagos (filtrado por coach_id=me)
  - Owner ve payouts del club (filtrado por club_id, RLS po_club_select)
REALTIME:
  /admin/admin-pagos suscribe a transactions + refunds + payouts
```

---

## 14. Dominio · `admin` operativo

### `/admin/admin-mod`
```
READ:
  AdminModScreen → reports(status pending/reviewing) + moderation_actions(30d)
    + profiles(display_name del reporter)
ACTION:
  actOnReport({ id: reportUuid, body })
    → SELECT reports por UUID real
    → opcional INSERT user_suspensions si action=suspend|ban y hay target_user_id
    → INSERT moderation_actions
    → UPDATE reports.status/reviewed_by/reviewed_at/resolution_notes
    → notify(report_resolved) al reporter
REALTIME:
  reports + moderation_actions (mig 181)
```

### `/admin/admin-roles`
```
READ:
  AdminRolesScreen → role_assignments + role_requests + clubs/profiles
ACTION:
  approveRoleRequest / rejectRoleRequest
  assignRole / revokeRole
REALTIME:
  role_assignments + role_requests (role_requests entra al publication en mig 181)
```

### `/admin/admin-team`
```
READ:
  role_assignments(role=admin) + profiles + tickets asignados + reports revisados hoy
ACTION:
  autoAssignTickets()
  assignTicket({ id, assigneeId })
    → si el estado cambia a `in_progress`, encola `ticket_status_changed`
      al dueño del ticket
  closeTicket({ id })
    → UPDATE tickets.status='closed', closed_at=now()
    → encola `ticket_status_changed` al dueño del ticket
  "Invitar staff" no crea usuarios; deriva a flujo real de asignar rol admin.
REALTIME:
  role_assignments + tickets + reports (reports entra al publication en mig 181)
DOWNSTREAM:
  - El dueño recibe bell inapp con link a `/dashboard/user/soporte`.
  - No hay DM de sistema: es una alerta puntual de estado, no una conversación.
```

### `/admin/admin-partners`
```
READ:
  AdminPartnersScreen → listAdminPartnersOverview (admin-only)
    → valida role_assignments(role=admin, revoked_at null)
    → luego usa getAdminClient() para una vista cross-tenant read-only
    → tablas: partner_orgs, partner_members, role_assignments(role=partner),
              partner_club_links, clubs, tournaments, leagues,
              registrations, transactions(kind=tournament), payouts(scope=partner),
              profiles
DERIVED:
  miembros partner_members, roles partner activos, clubes linkeados, torneos/ligas,
  inscripciones, ingresos capturados/pending y payouts pendientes/pagados.
ACTION:
  read-only. La creación/edición sigue en /api/v1/partners y actions de partner
  cuando exista un flujo CRM productivo.
REALTIME:
  partner_orgs + partner_members + partner_club_links + role_assignments +
  tournaments + leagues + registrations + transactions + payouts
```

### `/admin/admin-quedadas`
```
READ:
  AdminQuedadasScreen → listQuedadasAdmin + listQuedadaReports
    → tablas: quedadas, quedada_participants, quedada_reports, profiles
ACTION:
  cancelQuedadaAdmin({ quedadaId })
    → UPDATE quedadas.status='cancelled' (admin-only)
  resolveQuedadaReport({ reportId, resolution })
    → UPDATE quedada_reports.status/resolution metadata
REALTIME:
  quedadas + quedada_participants + quedada_reports
  → pantalla client-state usa callback granular para recargar listQuedadasAdmin
    + listQuedadaReports sin refrescar dashboards pesados completos.
DOWNSTREAM:
  - /dashboard/[role]/quedada/[id] refleja cancelación por realtime.
  - /dashboard/user/quedadas deja de mostrar la quedada como disponible si se cancela.
```

### `/admin/admin-matches`
```
READ:
  AdminMatchesScreen → listAdminMatchesData
    → tablas: matches, match_seeks, match_seek_applications,
              match_no_shows, player_reliability, profiles
ACTION:
  cancelMatchAdmin({ matchId, reason })
    → UPDATE matches.status='cancelled' + metadata de cancelación
  cancelMatchSeekAdmin({ seekId })
    → UPDATE match_seeks.status='cancelled'
  resolveMatchDisputeAdmin({ matchId, resolution, reason? })
    → UPDATE matches.status='confirmed'|'cancelled'
  dismissNoShowAdmin({ reportId })
    → UPDATE match_no_shows como descartado
  updatePlayerReliabilityAdmin({ userId, ... })
    → UPDATE player_reliability
REALTIME:
  matches + match_seeks + match_seek_applications + match_no_shows + player_reliability
  → pantalla client-state usa callback granular para recargar listAdminMatchesData
    sin router.refresh global.
DOWNSTREAM:
  - Chat del partido y "Mis avisos" refrescan cancelaciones/reprogramaciones por realtime.
  - Badges de fiabilidad se actualizan cuando consumen player_reliability.
```

### `/admin/admin-reservas`
```
READ:
  AdminReservasScreen → listAdminReservations
    → tablas: reservations, reservation_payments, transactions,
              refunds, clubs, courts, profiles
ACTION:
  cancelReservationAdmin({ reservationId, reason })
    → UPDATE reservations.status='cancelled'
  refundReservationAdmin({ reservationId, reason, refundReference? })
    → INSERT refunds + UPDATE transactions.status='refunded' / columnas refund_*
REALTIME:
  reservations + reservation_payments + transactions + refunds
  → pantalla client-state usa callback granular para recargar listAdminReservations
    sin router.refresh global.
DOWNSTREAM:
  - /owner|manager/club-reservas y /employee/e-reservas reciben cambios de estado.
  - /admin/admin-pagos y finanzas del club ven el refund por realtime.
```

### `/admin/admin-recepcion`
```
READ:
  AdminRecepcionScreen → listAdminReceptionOverview (admin-only, service role read)
    → tablas: walkins, check_ins, cash_sessions, transactions,
              sales, products, clubs, profiles
DERIVED:
  KPIs cross-club de walk-ins activos, check-ins del día, cajas abiertas,
  caja capturada, ventas de pro shop y productos bajo stock.
ACTION:
  read-only. No replica el POS employee ni ejecuta cobros, check-ins,
  cierres de caja o ajustes de stock.
REALTIME:
  walkins + check_ins + cash_sessions + transactions + sales +
  products + inventory_movements
DOWNSTREAM:
  - Las operaciones se hacen en /employee/e-checkin, /employee/e-walkins,
    /employee/e-caja y /employee/e-shop.
  - Soporte financiero sigue en /admin/admin-pagos y reservas en
    /admin/admin-reservas.
```

### `/admin/admin-plans`
```
READ:
  AdminMatchPointPlusScreenServer →
    listPendingPlanSubscriptionsAdmin + listRecentPlanSubscriptionsAdmin
    listPendingClubFeaturingAdmin + listRecentClubFeaturingAdmin
    countActiveFeaturedClubsAdmin
    player_subscriptions count(active, expires_at > now)
ACTION:
  approvePlanSubscriptionAdmin / rejectPlanSubscriptionAdmin
  approveClubFeaturingAdmin / rejectClubFeaturingAdmin
NO BACKEND:
  Funnel de paywall, trials, promos, clicks y uso por feature. No se muestran como
  métricas operativas hasta instrumentar eventos.
REALTIME:
  player_subscriptions + club_featuring_subscriptions + transactions + clubs
```

### `/user/mi-plan` (alias legacy: `/user/mp-plus`)
```
READ:
  MiPlanScreen → getSession + getProfileSummary
    → tablas: profiles
  MiPlanScreen → player_subscriptions propias
    → tablas: player_subscriptions
ACTION:
  requestPlanUpgrade({ tier: 'premium', durationMonths })
    → INSERT transactions(kind='plan', status='pending_proof')
    → INSERT player_subscriptions(status='pending')
    → redirige al user a /pagos/[transactionId] para subir comprobante
DOWNSTREAM:
  - /admin/admin-pagos ve la transaction pendiente.
  - /admin/admin-plans ve la subscription pendiente.
  - Al aprobar el comprobante, el profile queda premium y /user/mi-plan refleja
    el nuevo plan al refrescar.
```

### `/admin/admin-memberships`
```
READ:
  AdminClubMembresiasScreen →
    adminListClubMemberships({}) lee club_memberships + clubs + profiles
    + club_membership_tiers(price_cents,duration_months)
    + platform_config.take_rate_pct
DERIVED:
  socios activos, pendientes, clubes activos, mensual activo estimado y comisión
  estimada. No calcula churn ni issues porque no existe tabla de eventos de
  transición/soporte para esa señal.
ACTION:
  read-only. La aprobación/rechazo/revocación la hace el staff del club desde
  club-membresias.
```

### `/admin/admin-config`
```
READ:
  AdminConfigScreenServer → getRawPlatformConfig(keys de EDITABLE_CONFIG)
ACTION:
  updatePlatformConfig({ key, value }) solo para filas con cfg real.
READ-ONLY:
  Constantes de app, branding, integraciones y settings sin fila en
  platform_config se muestran como informativos; no hay platform_settings.
```

### Personalización admin retirada
```
RETIRADO:
  La superficie operativa anterior fue desconectada junto con el reset del
  sistema de personalización. No hay screen, actions ni tablas vivas para
  administrar cosméticos.
```

### Personalización de usuario retirada
```
RETIRADO:
  La ruta y el editor anterior fueron removidos. El nuevo sistema de
  personalización queda pendiente y deberá sumar sus propios contratos.
```

### Diseñador de temas retirado
```
RETIRADO:
  La pantalla del diseñador anterior fue removida con el reset.
```

### `/admin/admin-sponsors`
```
READ/ACTION:
  AdminPatrocinadoresScreen → listAdminSponsorsOverview
    → tablas: sponsors, sponsor_slots, sponsor_placements,
              sponsor_placement_events
DERIVED:
  KPIs honestos: marcas activas, slots, placements activos ahora, monto contratado
  de placements no archivados, impresiones/clics 30d desde eventos reales.
ACTION:
  createSponsor / updateSponsor / setSponsorStatus
    → INSERT/UPDATE sponsors (admin-only, service role + audit actor)
  createSponsorSlot / updateSponsorSlot
    → INSERT/UPDATE sponsor_slots
  createSponsorPlacement / updateSponsorPlacement / setSponsorPlacementStatus
    → INSERT/UPDATE sponsor_placements
  recordSponsorPlacementEvent
    → valida `active_sponsor_placements` y luego INSERT sponsor_placement_events.
REALTIME:
  sponsors + sponsor_slots + sponsor_placements + sponsor_placement_events
PUBLIC READ:
  `active_sponsor_placements` expone solo campos públicos de placements activos;
  no expone contacto, billing ni notas internas del sponsor.
```

### `/admin/admin-ventas`
```
READ:
  AdminSalesScreen → listAdminSalesLeads
    → tabla: sales_leads
DERIVED:
  KPIs honestos: leads totales, nuevos, demos, ganados, seguimientos vencidos
  y valor estimado cuando el lead lo tiene registrado.
ACTION:
  updateSalesLeadAdmin
    → UPDATE sales_leads.status/priority/notes/next_follow_up_at/lost_reason
    → setAuditActor(admin) + updated_by para trazabilidad.
REALTIME:
  sales_leads
DOWNSTREAM:
  - Nuevos envíos desde /soy-club o /precios aparecen en el inbox admin.
  - No hay lectura pública de sales_leads; el endpoint público solo inserta.
```

### `/admin/admin-ayuda-guias`
```
READ/ACTION:
  AdminAyudaGuiasScreen → listAdminHelpOverview
    → tablas: help_articles, help_article_revisions, help_feedback,
              help_search_logs
DERIVED:
  KPIs reales: artículos por estado, vistas, feedback útil/no útil y
  búsquedas sin resultado. No hay métricas inventadas.
ACTION:
  createHelpArticleDraft / updateHelpArticle / publishHelpArticle /
  archiveHelpArticle
    → INSERT/UPDATE help_articles + INSERT help_article_revisions
    → audit vía tg_audit + setAuditActor(admin)
REALTIME:
  help_articles + help_feedback + help_search_logs
```

### `/user/ayuda` y `/user/ayuda-guias`
```
READ:
  AyudaGuiasScreen → getHelpHomeData
    → tablas: help_articles (solo status='published' por RLS)
  getHelpCategoryData(categoryKey)
  getHelpArticleBySlug(slug)
ACTION:
  searchHelp({ query, categoryKey? })
    → SELECT help_articles publicados
    → INSERT help_search_logs con results_count
  recordHelpArticleView({ articleId })
    → RPC help_record_article_view(articleId), auth requerida y artículo publicado
  submitHelpFeedback({ articleId, helpful, comment? })
    → UPSERT help_feedback propio
    → actualiza contadores honestos en help_articles
DOWNSTREAM:
  Admin ayuda ve feedback y misses vía realtime.
```

---

## 15. Reglas de oro al agregar nuevas mutaciones

1. **Antes de migrar:** verificar si la tabla/función ya existe (ver `feedback_check_schema_before_migrate.md` en memoria). Usar `alter table add column if not exists` en vez de `create table if not exists` cuando solo agregas columnas — el segundo es silencioso ante divergencias.

2. **Antes de cablear:** identificar TODAS las pantallas downstream que leen las tablas que tu mutación toca (`grep "table.*X" src/components/dashboard/**/*Screen*.tsx`). Para cada una verificar que `useRealtimeRefresh` la incluye o que el patrón `router.refresh()` post-mutación es suficiente.

3. **Atomicidad:** si tu mutación toca 2+ tablas, encerrar en RPC PL/pgSQL `security definer` (ver `fn_create_sale`, `fn_materialize_club_from_application`, `transfer_team_captain`). NUNCA hacer chain de awaits en server action — falta atomicidad.

4. **Errores tipados:** en RPC usá `raise exception 'DOMAIN.CODE' using errcode='22023'`. En el server action mapeá esos códigos a `MpError` con HTTP status apropiado.

5. **Documentar aquí:** después de agregar mutación nueva, agregar entrada a la sección del dominio correspondiente.
