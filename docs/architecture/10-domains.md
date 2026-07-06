# 10 · Catálogo de dominios

> 18 dominios. Cada uno = un slice cohesivo de tablas + un módulo de Server Actions + un namespace en `/api/v1/`. La columna **Pantallas** es el mapping bidireccional con la UI ya migrada.

---

## Convenciones

- **Owner del dominio:** rol que es el "consumidor principal" de las pantallas. Otros roles también pueden tener vistas (ej. user ve reservas, owner también).
- **Cross-tenant** = el dominio toca datos globales (sin `club_id`).
- **Tablas raíz** = las 1-3 tablas más importantes del dominio. La lista completa va en `20-database.md`.

---

## A. NÚCLEO (7)

### 1. `identity`
- **Owner:** todos
- **Cross-tenant:** sí
- **Tablas raíz:** `profiles`, `role_assignments`, `sessions`
- **Pantallas:** todos los layouts, RoleSwitcher, login/signup (por hacer), `/user/profile`, `/coach/c-perfil`
- **Server Actions:** `signUp`, `signIn`, `signOut`, `switchRole`, `updateProfile`, `requestRole`
- **Endpoints:** `/auth/*`, `/me`, `/me/roles`

### 2. `clubs` (incluye sub-dominio `club-applications`)
- **Owner:** owner / manager / partner / admin · user (solicitante)
- **Cross-tenant:** sí (lista pública) + tenant (configuración interna)
- **Tablas raíz:** `clubs`, `club_settings`, `club_amenities`, `club_photos`, `club_applications` (+ `_courts`, `_documents`, `_photos`, `_events`)
- **Pantallas:** `/user/clubes` (descubrir), `/user/solicitar-club` (wizard 5 pasos + submitted + approved), `/owner/club-config`, `/admin/admin-clubs` (cola de aplicaciones), `/partner/p-clubes`
- **Server Actions:**
  - Públicas: `createClubApplication` (inicia draft), `updateClubApplicationStep` (autosave por paso), `addApplicationCourt`/`removeApplicationCourt`, `uploadApplicationDocument`, `uploadApplicationPhoto`, `submitClubApplication`, `withdrawClubApplication`
  - Admin: `startDocsReview`, `approveDocument`/`rejectDocument`, `scheduleFieldVerification`, `markFieldVerified`, `startFinalReview`, `approveClubApplication` (→ ejecuta `fn_materialize_club_from_application`), `rejectClubApplication`, `addReviewerNote`
  - Post-aprobación: `updateClub`, `archiveClub`
- **Endpoints:**
  - `GET /me/club-application` (el draft o último submitted del user)
  - `POST /club-applications` · `GET /club-applications/:id` · `PATCH /club-applications/:id` · `DELETE /club-applications/:id` (withdraw)
  - `POST /club-applications/:id/courts` · `DELETE /club-applications/:id/courts/:courtId`
  - `POST /club-applications/:id/documents` (multipart) · `POST /club-applications/:id/photos`
  - `POST /club-applications/:id/submit`
  - `GET /admin/club-applications?status=` (cola)
  - `POST /admin/club-applications/:id/transitions/{docs_review|field_verification|final_review|approve|reject}`
  - `GET /clubs`, `GET /clubs/:id`, `PATCH /clubs/:id`

### 2b. `club-reviews`
- **Owner:** user (escribe) · público (lee) · staff de club (lee)
- **Cross-tenant:** sí (cualquier user puede dejar review a cualquier club)
- **Tablas raíz:** `club_reviews` (rating 1-5, NPS 0-10, comment, reservation_id; unique `(club_id, user_id, reservation_id)`) — migration `032_role_gaps.sql`
- **Pantallas:** `/clubes/[slug]` (sección "Reseñas" con form 5-estrellas + lista pública), tarjetas de `/user/clubes` muestran avg + count
- **Server Actions:** `listClubReviews`, `createClubReview` (upsert por par user-club sin reservation_id), `getClubReviewStats` (bulk via RPC `get_club_review_stats` — migration 038)
- **RPC bulk:** `get_club_review_stats(p_club_ids uuid[])` retorna `(club_id, avg_rating, reviews_count)` para evitar N+1 en listings

### 3. `courts`
- **Owner:** owner / manager
- **Tablas raíz:** `courts`, `court_pricing`, `court_blocks` (cierres/mantenimiento)
- **Pantallas:** `/owner/club-canchas`, `/manager/club-canchas`
- **Server Actions:** `createCourt`, `updateCourt`, `blockCourt`, `setCourtPricing`
- **Endpoints:** `GET /clubs/:id/courts`, `POST/PATCH/DELETE /courts/:id`, `POST /courts/:id/blocks`

### 4. `reservations`
- **Owner:** user (reserva) · employee/manager/owner (gestionan)
- **Tablas raíz:** `reservations`, `reservation_participants`, `reservation_payments`, `walkins`
- **Pantallas:** `/user/inicio` (próxima), `/owner/club-reservas`, `/manager/club-reservas`, `/employee/e-reservas`, `/employee/e-walkins`, modal `CrearMatchModal`, modal `ReservaCancha`
- **Server Actions:** `createReservation`, `cancelReservation`, `joinReservation`, `inviteToReservation`, `createWalkinReservation`
- **Endpoints:** `GET /reservations`, `POST /reservations`, `PATCH /reservations/:id`, `DELETE /reservations/:id`, `GET /courts/:id/availability?date=`

### 5. `checkins`
- **Owner:** employee / manager
- **Tablas raíz:** `check_ins`
- **Pantallas:** `/employee/e-checkin`, `/employee` (próximos check-ins)
- **Server Actions:** `scanQrCheckIn`, `manualCheckIn`, `markNoShow`
- **Endpoints:** `POST /checkins/scan`, `POST /checkins/manual`, `GET /checkins/queue`

### 6. `cash` (POS / Caja)
- **Owner:** employee · manager (cierre Z) · owner (lectura)
- **Tablas raíz:** `cash_sessions`, `cash_movements`, `transactions`, `refunds`
- **Pantallas:** `/employee/e-caja`, `/owner/club-finanzas`, `/manager/club-reportes`
- **Server Actions:** `openCashSession`, `closeCashSession`, `chargeReservation`, `chargeProShop`, `refundTransaction`
- **Endpoints:** `GET /cash/sessions`, `POST /cash/sessions/open`, `POST /cash/sessions/:id/close`, `POST /cash/transactions`, `POST /cash/transactions/:id/refund`

### 1b. `onboarding` (primer login del user)
- **Owner:** user
- **Tablas raíz:** `profiles.onboarded_at` (migration 041)
- **Pantallas:** `OnboardingWizard` (overlay sobre `/dashboard/user`) — 3 pasos: (1) ciudad + deporte preferido + nivel, (2) clubes sugeridos basados en ciudad, (3) CTA a amigos / team / torneos
- **Server Actions:** `completeOnboarding({ city?, preferredSport?, skillLevel? })` en `actions/me.ts` — idempotente, marca `onboarded_at = now()` y aplica los campos pasados
- **Trigger UI:** `UserHomeView` muestra wizard si `meUserId !== null && onboardedAt === null && !wizardClosed`. State local permite cerrar optimísticamente
- **Skip path:** botón "Saltar" en cualquier paso → marca `onboarded_at = now()` sin aplicar campos (no vuelve a aparecer)
- **Backfill (migration 041):** usuarios existentes con `city` y `preferred_sport` ya seteados quedaron auto-onboarded para no re-mostrar el wizard a quienes ya configuraron su perfil

### 6b. `storage` (uploads de imágenes)
- **Owner:** user (avatar propio) · club staff (logo/cover del club)
- **Buckets:**
  - `avatars` (público) — `{userId}/avatar-{ts}.{ext}`. Policies: `avatars_public_select`, `avatars_owner_write/update/delete` (035)
  - `clubs` (público, migration 040) — `{clubId}/logo-{ts}.{ext}` y `{clubId}/cover-{ts}.{ext}`. Policies: `clubs_public_select`, `clubs_staff_write/update/delete` con check `mp_club_staff(clubId)`
  - `club-covers` (privado) — covers de **aplicaciones de club** (pre-aprobación), path `{userId}/...`
  - `club-courts`, `kyc-docs`, `tickets-attachments`, `resources` — ya existían
- **Componente reusable:** `<ImageUploader bucket folder filenamePrefix currentUrl shape height onUploaded />` — valida MIME (jpg/png/webp) y tamaño (4 MB max), sube via `@supabase/storage-js` (respeta RLS), devuelve public URL con cache-bust
- **Server Actions:** `updateMyAvatar({ avatarUrl })` (en `actions/me.ts`); para logo/cover de club se reutiliza `updateClub` que ya acepta `logoUrl` y `coverUrl`
- **Pantallas cableadas:** `/user/perfil` (avatar overlay con botón lápiz), `/owner/club-config` (sección "Identidad visual" con logo + cover)

### 7. `proshop`
- **Owner:** employee (venta) · manager/owner (inventario)
- **Tablas raíz:** `products`, `product_categories`, `inventory_movements`, `sales`, `sale_items`
- **Pantallas:** `/user/shop`, `/employee/e-shop`, modal `CarritoModal`, modal `CheckoutModal`
- **Server Actions:** `createProduct`, `adjustInventory`, `createSale` (delega a RPC `fn_create_sale` para atomicidad — ver abajo), `addToCart`, `checkoutCart`
- **RPC atómica:** `fn_create_sale(p_club_id, p_user_id, p_customer_user_id?, p_customer_name?, p_method, p_items[])` — migration 039. Lockea filas en `products` con `select ... for update`, valida stock/club/currency, y aplica `transactions + sales + sale_items + UPDATE stock + inventory_movements` en una sola transacción. Mapea excepciones SQL → códigos `PROSHOP.OUT_OF_STOCK`, `PROSHOP.NOT_FOUND`, `PROSHOP.INACTIVE`, `PROSHOP.CLUB_MISMATCH`, `PROSHOP.CURRENCY_MIXED`, `CASH.SESSION_CLOSED`.
- **Endpoints:** `GET /products`, `GET /products/:id`, `POST /products`, `PATCH /products/:id`, `POST /sales`, `GET /carts/me`, `POST /carts/me/items`, `POST /carts/me/checkout`

---

## B. COACHING (4)

### 8. `coaches`
- **Owner:** coach · admin (verificación)
- **Tablas raíz:** `coach_profiles`, `coach_specialties`, `coach_availability`, `coach_certifications`, `coach_reviews`
- **Pantallas:** `/coach/c-perfil`, `/user/clubes` (perfil de coach al ver club)
- **Server Actions:** `updateCoachProfile`, `setCoachAvailability`, `addCertification`, `reviewCoach`
- **Endpoints:** `GET /coaches/:id`, `PATCH /coaches/me`, `GET /coaches/:id/availability`, `POST /coaches/:id/reviews`

### 9. `classes`
- **Owner:** coach · user (inscribirse)
- **Tablas raíz:** `classes` (grupales), `class_sessions`, `class_enrollments`, `lessons_1on1`
- **Pantallas:** `/coach/c-clases`, `/coach` (próxima clase), `/user/mis-clases`, `/user/academia`, modal `ReservaClase`
- **Server Actions:** `createClass`, `scheduleClassSession`, `enrollInClass`, `cancelEnrollment`, `bookLesson1on1`
- **Endpoints:** `GET /classes`, `POST /classes`, `POST /classes/:id/sessions`, `POST /classes/:id/enroll`, `POST /lessons`, `GET /me/classes`

### 10. `students`
- **Owner:** coach
- **Tablas raíz:** `student_progress`, `student_evaluations`, `student_notes`
- **Pantallas:** `/coach/c-alumnos`
- **Server Actions:** `updateStudentProgress`, `addEvaluation`, `addStudentNote`
- **Endpoints:** `GET /coaches/me/students`, `GET /students/:id`, `POST /students/:id/evaluations`, `POST /students/:id/notes`

### 11. `resources`
- **Owner:** coach (sube) · user/student (consume)
- **Tablas raíz:** `resources`, `resource_files`, `resource_access`, `resource_views`
- **Pantallas:** `/coach/c-recursos` (biblioteca), `/user/academia` (cuando enrolado)
- **Server Actions:** `uploadResource`, `shareResource`, `markResourceViewed`
- **Endpoints:** `GET /resources`, `POST /resources`, `GET /resources/:id`, `POST /resources/:id/access`, `POST /resources/:id/view`

---

## C. SOCIAL (3)

### 12. `messaging`
- **Owner:** user · coach (chat con alumnos) · owner (chat con clientes)
- **Cross-tenant:** sí (conversaciones cross-club)
- **Tablas raíz:** `conversations`, `conversation_members`, `messages`, `message_reads`, `message_attachments`
- **Pantallas:** `/user/mensajes`, badges no-leído en todos los topbars, modal de mensaje rápido
- **Server Actions:** `startConversation`, `sendMessage`, `markRead`, `addMember`, `leaveConversation`
- **Endpoints:** `GET /conversations`, `POST /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`, `POST /conversations/:id/read`
- **Realtime:** sí ✅

### 13. `friends`
- **Owner:** user
- **Cross-tenant:** sí
- **Tablas raíz:** `friendships`, `friend_requests`, `blocks`
- **Pantallas:** `/user/amigos`
- **Server Actions:** `sendFriendRequest`, `acceptFriendRequest`, `removeFriend`, `blockUser`
- **Endpoints:** `GET /me/friends`, `POST /friends/requests`, `POST /friends/requests/:id/accept`, `DELETE /friends/:id`

### 14. `teams`
- **Owner:** user
- **Cross-tenant:** sí (un team puede tener miembros de varios clubes)
- **Tablas raíz:** `teams` (con `invite_code` único + `privacy` public/invite/private — migration 036), `team_members`, `team_invites`, `team_join_requests` (migration 037)
- **Pantallas:** `/user/team` (vistas: empty / create / join / settings / invite / home)
- **Server Actions:** `createTeam`, `updateTeam`, `disbandTeam`, `leaveTeam`, `transferCaptain` (vía RPC `transfer_team_captain` SECURITY DEFINER), `joinTeamByCode`, `requestJoinTeam`, `respondToJoinRequest`, `cancelJoinRequest`, `inviteToTeam`, `cancelInvite`, `acceptTeamInvite`, `declineTeamInvite`
- **Endpoints:** `GET /teams`, `POST /teams`, `GET /teams/:id`, `POST /teams/:id/invites`, `POST /teams/invites/:id/accept`

---

## D. COMPETITIVO (3)

### 15. `ranking`
- **Owner:** user (consume) · sistema (calcula)
- **Cross-tenant:** sí
- **Tablas raíz:** `match_results`, `player_stats`, `ranking_snapshots`, `mv_user_ranking`
- **Pantallas:** `/user/ranking`, badges en perfiles
- **Server Actions:** `submitMatchResult`, `confirmMatchResult`, `disputeMatchResult`
- **Endpoints:** `GET /ranking?sport=&level=`, `GET /users/:id/ranking-history`, `POST /matches/results`, `POST /matches/results/:id/confirm`
- **Recalculo:** job nocturno `pg_cron` + recálculo eventual al confirmar resultado

### 16. `tournaments` (incluye leagues)
- **Owner:** partner · admin (incluye soporte cross-tenant)
- **Cross-tenant:** sí
- **Tablas raíz:** `leagues`, `tournaments`, `tournament_categories`, `registrations`, `brackets`, `bracket_matches`
- **Pantallas:** `/partner/p-ligas`, `/partner/p-torneos`, `/partner/p-brackets`, `/partner/p-inscritos`, `/user/eventos` (al ver torneo), `/admin/admin-events/[id]` (detalle de soporte)
- **Server Actions:** `createLeague`, `createTournament`, `openRegistrations`, `closeRegistrations`, `generateBracket`, `reportMatchScore`, `advanceBracket`, **`cancelTournament` (admin)**, **`getTournamentForAdmin` (admin)**
- **Endpoints:** `GET /leagues`, `POST /leagues`, `GET /tournaments/:id`, `POST /tournaments`, `POST /tournaments/:id/register`, `GET /tournaments/:id/bracket`, `PATCH /matches/:id/score`
- **Realtime:** sí ✅ (brackets en vivo)

### 17. `events`
- **Owner:** owner/manager (eventos de club) · partner (eventos cross-club) · admin (eventos plataforma, soporte cross-tenant)
- **Tablas raíz:** `events`, `event_registrations`, `event_check_ins`
- **Pantallas:** `/user/eventos`, `/owner/club-eventos`, `/manager/club-eventos`, `/admin/admin-events`, `/admin/admin-events/[id]` (detalle de soporte)
- **Server Actions:** `createEvent`, `publishEvent`, `registerToEvent`, `cancelRegistration`, `checkInToEvent`, **`cancelEvent` (admin)**, **`getEventForAdmin` (admin)**
- **Endpoints:** `GET /events`, `POST /events`, `POST /events/:id/register`, `POST /events/:id/checkin`
- **Soporte admin:** `/admin/admin-events/[id]` muestra inscritos + transactions + permite cancelar evento. La ruta dispatcha sobre prefijo del id: `ev-{uuid}` → `AdminEventDetailView`, `tr-{uuid}` → `AdminTournamentDetailView`. Esto funciona porque la lista de admin junta `events` y `tournaments` en una sola tabla.

---

## E. CROSS (6)

### 18. `moderation` (incluye audit)
- **Owner:** admin · owner (limitado a su club)
- **Tablas raíz:** `reports` (denuncias), `moderation_actions`, `audit_log`, `audit_log_global`
- **Pantallas:** `/admin/admin-mod`, `/admin/admin-audit`
- **Server Actions:** `reportContent`, `actOnReport`, `suspendUser`, `unbanUser`
- **Endpoints:** `GET /admin/reports`, `POST /reports`, `POST /admin/reports/:id/act`, `GET /admin/audit?entity=`

### 19. `support`
- **Owner:** user (abre) · employee/manager/admin (atienden)
- **Tablas raíz:** `tickets`, `ticket_messages`, `ticket_attachments`
- **Pantallas:** `/admin/admin-support`, `/employee/e-soporte`
- **Server Actions:** `createTicket`, `assignTicket`, `replyToTicket`, `closeTicket`, `reopenTicket`
- **Endpoints:** `GET /tickets`, `POST /tickets`, `GET /tickets/:id`, `POST /tickets/:id/messages`, `POST /tickets/:id/close`

### 20. `notifications`
- **Owner:** todos (cada rol recibe sus kinds)
- **Cross-tenant:** sí
- **Tablas raíz:** `notifications`, `notification_kinds`, `notification_preferences`, `notification_subscriptions`, `notification_jobs`, `notification_templates`
- **Pantallas:** bell en topbar (todos los roles), pantalla de preferencias (por hacer)
- **Server Actions:** `markNotificationRead`, `markAllRead`, `updatePreferences`, `subscribePush`, `unsubscribePush`
- **Endpoints:** `GET /notifications?role=`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET /me/notification-preferences`, `PATCH /me/notification-preferences`, `POST /notifications/subscriptions`
- **Realtime:** sí ✅ (`user:{id}:role:{activeRole}:notifications`)
- **Role-aware:** ver `00-overview.md §3` y `30-rls.md`

### 21. `marketing` (broadcasts)
- **Owner:** admin (plataforma) · owner/manager (su club) · partner (su federación)
- **Tablas raíz:** `broadcasts`, `broadcast_recipients`, `campaigns`
- **Pantallas:** `/admin/admin-broadcast`, `/owner/club-marketing`, `/manager/club-marketing`, `/partner/p-marketing`
- **Server Actions:** `createBroadcast`, `scheduleBroadcast`, `cancelBroadcast`, `previewBroadcast`
- **Endpoints:** `POST /broadcasts`, `GET /broadcasts`, `POST /broadcasts/:id/cancel`
- **Productor de:** `notifications.broadcast.received` + `notification_jobs`

### 22. `feature-flags`
- **Owner:** admin
- **Cross-tenant:** sí
- **Tablas raíz:** `feature_flags`, `feature_flag_assignments`
- **Pantallas:** `/admin/admin-flags`
- **Server Actions:** `createFlag`, `toggleFlag`, `assignFlagToCohort`
- **Endpoints:** `GET /admin/flags`, `POST /admin/flags`, `PATCH /admin/flags/:id`, `GET /me/flags` (qué tiene activo el usuario actual)

### 23. `partners` (federaciones)
- **Owner:** admin · partner
- **Tablas raíz:** `partner_orgs`, `partner_members`, `partner_club_links`
- **Pantallas:** `/admin/admin-team`, `/partner/p-clubes`, `/partner/p-finanzas` (revenue share)
- **Server Actions:** `createPartner`, `inviteToPartner`, `linkClubToPartner`, `setRevenueShare`
- **Endpoints:** `GET /partners`, `POST /partners`, `POST /partners/:id/members`, `POST /partners/:id/clubs/:clubId/link`

### 24. `shifts` (horarios de staff)
- **Owner:** owner / manager (gestiona) · employee / coach (lee los propios)
- **Tablas raíz:** `shifts` (con exclusion constraint GIST `(user_id, during)` para evitar solapamientos) — migration `032_role_gaps.sql`
- **Pantallas:** `StaffShiftsOverlay` desde tarjeta de staff en `/owner/club-staff` (overlay) — futuro: dashboard de turnos por club
- **Server Actions:** `listShifts({ clubId?, userId?, fromIso?, toIso? })`, `createShift`, `deleteShift`
- **Errores específicos:** `SHIFTS.OVERLAP` (mapea PG `23P01` exclusion violation)

### 25. `payouts` (pagos a clubes / partners / coaches)
- **Owner:** admin (procesa) · club staff / partner admin / coach (lee los propios)
- **Tablas raíz:** `payouts` (scope `club` | `partner` | `coach`, status `pending|approved|processing|paid|failed|cancelled`) — migration `032_role_gaps.sql`
- **Pantallas:** `/coach/c-pagos` (lee transactions + futura integración con payouts agregados), `/owner/club-finanzas`, `/admin/admin-finance`
- **Server Actions:** `listPayouts`, `processPendingPayouts` (admin: cron-friendly, suma transactions captured y crea payouts pending), `markPayoutPaid`, `processRefund`

---

## Mapping inverso: pantalla → dominios

| Pantalla | Dominios que toca |
|---|---|
| `/user/inicio` (UserHome) | identity, reservations, classes, notifications, friends, ranking |
| `/user/ranking` | ranking, friends |
| `/user/clubes` | clubs, coaches, courts |
| `/user/solicitar-club` (wizard) | clubs (sub-dominio applications), notifications |
| `/user/eventos` | events, tournaments |
| `/user/mensajes` | messaging, friends |
| `/user/amigos` | friends |
| `/user/shop` | proshop |
| `/user/mis-clases` | classes |
| `/user/academia` | classes, resources |
| `/user/team` | teams, friends |
| `/user/profile` | identity, ranking |
| `/owner` (OwnerHome) | clubs, reservations, cash, notifications, support |
| `/owner/club-reservas` | reservations, courts, identity |
| `/owner/club-canchas` | courts |
| `/owner/club-clientes` | identity (clientes del club), reservations |
| `/owner/club-finanzas` | cash, proshop, classes |
| `/owner/club-marketing` | marketing, notifications |
| `/owner/club-config` | clubs |
| `/owner/club-eventos` | events |
| `/owner/club-staff` | identity, role_assignments |
| `/manager/*` | mismo que owner pero scope reducido |
| `/employee/e-checkin` | checkins, reservations |
| `/employee/e-walkins` | reservations (walkin) |
| `/employee/e-caja` | cash |
| `/employee/e-reservas` | reservations |
| `/employee/e-shop` | proshop |
| `/employee/e-soporte` | support |
| `/coach/c-clases` | classes |
| `/coach/c-alumnos` | students, classes |
| `/coach/c-calendar` | classes, lessons_1on1 |
| `/coach/c-pagos` | cash (lectura), classes |
| `/coach/c-recursos` | resources |
| `/coach/c-perfil` | coaches, identity |
| `/partner/p-ligas` | tournaments (leagues) |
| `/partner/p-torneos` | tournaments |
| `/partner/p-brackets` | tournaments (brackets) |
| `/partner/p-inscritos` | tournaments (registrations) |
| `/partner/p-clubes` | partners, clubs |
| `/partner/p-finanzas` | partners (revenue share), tournaments |
| `/partner/p-marketing` | marketing, notifications |
| `/admin/admin-clubs` | clubs (cola de aplicaciones + clubs activos) |
| `/admin/admin-users` | identity, moderation |
| `/admin/admin-mod` | moderation |
| `/admin/admin-pagos` | cash (global), tournaments |
| `/admin/admin-events` | events |
| `/admin/admin-support` | support |
| `/admin/admin-metrics` | (vistas materializadas cross-dominio) |
| `/admin/admin-audit` | moderation (audit_log) |
| `/admin/admin-config` | feature-flags, clubs |
| `/admin/admin-roles` | identity (role_assignments) |
| `/admin/admin-team` | partners, identity |
| `/admin/admin-flags` | feature-flags |
| `/admin/admin-broadcast` | marketing |

---

## Dependencias entre dominios

```
identity ──► todos
clubs ──► courts, reservations, checkins, cash, proshop, classes, events, marketing, partners
courts ──► reservations, checkins
reservations ──► checkins, cash, notifications
cash ──► reservations, proshop, classes (pagos), tournaments (inscripciones)
classes ──► students, resources, cash, notifications
tournaments ──► cash (registrations), notifications, ranking (match_results)
events ──► cash (paid events), notifications
marketing ──► notifications
moderation ──► identity (suspender)
support ──► identity, clubs
notifications ◄── todos (consumidor)
audit_log ◄── todos (vía triggers)
feature-flags ──► todos (consumidor)
```

Orden topológico de migraciones SQL (próximo doc):
1. identity → clubs → courts → reservations → checkins → cash → proshop
2. coaches → classes → students → resources
3. messaging → friends → teams
4. ranking → tournaments → events
5. notifications → marketing → moderation/audit → support → feature-flags → partners
