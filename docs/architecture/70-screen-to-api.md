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
  dismissNotification({ id })        → soft-delete vía dismissed_at
REALTIME:
  Suscribe a postgres_changes en notifications WHERE recipient_user_id=eq.{userId}
  → tanto el badge del TopBar como el panel se refrescan automáticamente
PRODUCTORES DE NOTIFICATIONS:
  Múltiples actions disparan fn_enqueue_notification(p_user_id, p_role, p_kind, p_title, ...)
  Ejemplos: createBroadcast, approveClubApplication, accept/declineTeamInvite, etc.
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
  listBroadcasts (filtrado por scope)
ACTION:
  createBroadcast({ scope, title, body, channels, scheduledFor? })
    → INSERT broadcasts (status="draft" si no scheduledFor, "scheduled" si sí)
    → cron o worker después la dispatcha → fn_enqueue_notification por cada recipient
  cancelBroadcast({ id })
    → UPDATE broadcasts SET status='cancelled' (solo si era draft o scheduled)
REALTIME:
  Suscribe a broadcasts + broadcast_recipients (para KPIs delivered/opened)
DOWNSTREAM:
  - Cuando el dispatcher la procesa: notifications insertadas, el TopBar de cada recipient se actualiza
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
  /admin/admin-pagos: listPayouts (todos)
ACTION (admin):
  processPendingPayouts({ periodStart, periodEnd })
    → para cada club active: SUM transactions captured en el período - commission
    → INSERT payouts (status="processing")
  markPayoutPaid({ id, providerPayoutId })
    → UPDATE payouts SET status='paid', paid_at=now(), provider_payout_id=X
DOWNSTREAM:
  - Coach ve su payout en /coach/c-pagos (filtrado por coach_id=me)
  - Owner ve payouts del club (filtrado por club_id, RLS po_club_select)
```

---

## 14. Reglas de oro al agregar nuevas mutaciones

1. **Antes de migrar:** verificar si la tabla/función ya existe (ver `feedback_check_schema_before_migrate.md` en memoria). Usar `alter table add column if not exists` en vez de `create table if not exists` cuando solo agregás columnas — el segundo es silencioso ante divergencias.

2. **Antes de cablear:** identificar TODAS las pantallas downstream que leen las tablas que tu mutación toca (`grep "table.*X" src/components/dashboard/**/*Screen*.tsx`). Para cada una verificar que `useRealtimeRefresh` la incluye o que el patrón `router.refresh()` post-mutación es suficiente.

3. **Atomicidad:** si tu mutación toca 2+ tablas, encerrar en RPC PL/pgSQL `security definer` (ver `fn_create_sale`, `fn_materialize_club_from_application`, `transfer_team_captain`). NUNCA hacer chain de awaits en server action — falta atomicidad.

4. **Errores tipados:** en RPC usá `raise exception 'DOMAIN.CODE' using errcode='22023'`. En el server action mapeá esos códigos a `MpError` con HTTP status apropiado.

5. **Documentar acá:** después de agregar mutación nueva, agregar entrada a la sección del dominio correspondiente.
