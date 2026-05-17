# 40 · API Catalog

> Catálogo completo de **Route Handlers REST** (`/api/v1/*`) y **Server Actions** por dominio. Cada entrada lista: método, path/action, input Zod, output Zod, errors específicos, scopes requeridos.

---

## 1. Convenciones

### 1.1 Naming

- **Route Handlers** → REST puro, `/api/v1/<dominio>/<recurso>`, snake-case en path es OK (`/club-applications`).
- **Server Actions** → camelCase, exportadas de `src/server/actions/<dominio>.ts`. Siempre `async`, primer arg = input parseado por Zod.
- **Schemas Zod** → `<Entidad>Schema` (output), `<Entidad>CreateSchema`, `<Entidad>UpdateSchema`, `<Entidad>ListParamsSchema`.

### 1.2 Response envelope

```ts
type ApiOk<T> = { ok: true; data: T; meta?: PageMeta };
type ApiErr = { ok: false; error: { code: string; message: string; fields?: Record<string,string[]>; requestId: string } };
type PageMeta = { page: number; pageSize: number; total: number };
```

Server Actions retornan **el mismo shape** (sin envolver en HTTP):

```ts
export async function createReservation(input: ReservationCreateInput): Promise<ActionResult<Reservation>> { ... }
```

### 1.3 Paginación / filtros / ordenamiento

Query params estandarizados:

| Param | Default | Notas |
|---|---|---|
| `page` | 1 | base 1 |
| `pageSize` | 20 | máx 100 |
| `sort` | depende | `-created_at` desc, `name` asc |
| `q` | – | texto libre (cuando aplica trgm) |
| `filter[<col>]` | – | igualdad simple |
| `filter[<col>][gte\|lte\|in]` | – | rangos |

### 1.4 Headers comunes

| Header | Propósito |
|---|---|
| `Authorization: Bearer <jwt>` | Auth (alternativa a cookie) |
| `X-Active-Role: owner` | Rol activo (si distinto de cookie) |
| `X-Active-Club: <uuid>` | Club activo (override de cookie) |
| `Idempotency-Key: <uuid>` | Idempotencia en mutaciones críticas |
| `X-Request-Id` | Auto-asignado si no viene |

### 1.5 Errores de dominio

Formato `DOMAIN.SCREAMING_CASE`:

| Code | HTTP | Cuándo |
|---|---|---|
| `AUTH.UNAUTHENTICATED` | 401 | sin sesión |
| `AUTH.ROLE_REQUIRED` | 403 | rol activo insuficiente |
| `AUTH.SCOPE_REQUIRED` | 403 | rol OK pero no este club |
| `VALIDATION.FAILED` | 400 | Zod input fail (lleva `fields`) |
| `RESOURCE.NOT_FOUND` | 404 | id inexistente o RLS lo oculta |
| `RESOURCE.CONFLICT` | 409 | unique constraint |
| `RESERVATION.SLOT_TAKEN` | 409 | EXCLUDE constraint disparado |
| `RESERVATION.WINDOW_CLOSED` | 422 | fuera de cancellation_window |
| `CASH.SESSION_CLOSED` | 422 | intentar cobrar con caja cerrada |
| `CASH.SESSION_ALREADY_OPEN` | 409 | abrir 2da sesión simultánea |
| `PAYMENT.CARD_DECLINED` | 422 | provider rechaza |
| `PAYMENT.PROVIDER_ERROR` | 502 | falla externa |
| `CLUB_APP.STEP_INVALID` | 422 | step no se puede pasar |
| `CLUB_APP.TRANSITION_FORBIDDEN` | 409 | transición state-machine no válida |
| `TOURNAMENT.REGISTRATION_CLOSED` | 422 | fuera de ventana |
| `IDEMPOTENCY.MISMATCH` | 409 | misma key, distinto body |
| `RATE_LIMIT.EXCEEDED` | 429 | bucket vacío |

---

## 2. Dominio · identity / auth

### Server Actions (`src/server/actions/auth.ts`)

| Action | Input | Output | Errors | Notas |
|---|---|---|---|---|
| `signUp` | `SignUpSchema` `{email, password, displayName, username}` | `ProfileSchema + Session` | `VALIDATION.FAILED`, `RESOURCE.CONFLICT` (username) | Rate-limit 5/min |
| `signIn` | `SignInSchema` `{email, password}` | `Session` | `AUTH.INVALID_CREDENTIALS` | |
| `signInWithOauth` | `{provider, redirectTo}` | `{url}` | – | Redirect a Supabase OAuth |
| `signOut` | – | `void` | – | |
| `requestPasswordReset` | `{email}` | `void` | – | Idempotente, no leak |
| `resetPassword` | `{token, password}` | `void` | `AUTH.INVALID_TOKEN` | |
| `switchRole` | `{role, clubId?}` | `{activeRole, activeClubId}` | `AUTH.ROLE_REQUIRED` | Setea cookie `mp_active_role` |
| `updateProfile` | `ProfileUpdateSchema` | `Profile` | – | |
| `requestRole` | `{role, clubId?, reason}` | `RoleRequest` | – | Genera fila `role_requests` |

### Route Handlers REST

| Method | Path | Input | Output | Server Action |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/sign-up` | `SignUpSchema` | `{user, session}` | `signUp` |
| `POST` | `/api/v1/auth/sign-in` | `SignInSchema` | `{user, session}` | `signIn` |
| `POST` | `/api/v1/auth/sign-out` | – | `{ok:true}` | `signOut` |
| `POST` | `/api/v1/auth/password-reset/request` | `{email}` | `{ok:true}` | `requestPasswordReset` |
| `POST` | `/api/v1/auth/password-reset/confirm` | `{token,password}` | `{ok:true}` | `resetPassword` |
| `POST` | `/api/v1/auth/switch-role` | `{role,clubId?}` | `{activeRole,activeClubId}` | `switchRole` |
| `GET` | `/api/v1/me` | – | `Profile + roles[] + activeRole` | – |
| `GET` | `/api/v1/me/roles` | – | `RoleAssignment[]` | – |
| `PATCH` | `/api/v1/me` | `ProfileUpdateSchema` | `Profile` | `updateProfile` |
| `POST` | `/api/v1/me/role-requests` | `RoleRequestCreate` | `RoleRequest` | `requestRole` |

---

## 3. Dominio · clubs + club-applications

### 3.1 clubs (post-aprobación)

| Method | Path | Input | Output | Action | Scope |
|---|---|---|---|---|---|
| `GET` | `/api/v1/clubs` | `ClubListParams` (`q`, `country`, `city`, `sport`, `near=lat,lng,km`) | `Club[]` paginado | – | public |
| `GET` | `/api/v1/clubs/:id` | – | `Club + settings + amenities + photos` | – | public read |
| `PATCH` | `/api/v1/clubs/:id` | `ClubUpdateSchema` | `Club` | `updateClub` | owner/admin |
| `POST` | `/api/v1/clubs/:id/archive` | – | `Club` | `archiveClub` | owner/admin |
| `GET` | `/api/v1/clubs/:id/amenities` | – | `Amenity[]` | – | public |
| `PUT` | `/api/v1/clubs/:id/amenities` | `string[]` | `Amenity[]` | – | owner/manager |

### 3.2 club-applications (wizard "Solicitar Club")

> Sub-dominio crítico. Cada step persiste vía PATCH parcial. Las transiciones de estado las hace admin con endpoints dedicados (no inferencia mágica).

#### Server Actions (`src/server/actions/clubApplications.ts`)

| Action | Input | Output | Errors |
|---|---|---|---|
| `getMyApplication` | – | `ClubApplication?` | – |
| `createApplication` | – | `ClubApplication` (status='draft', step=1) | `RESOURCE.CONFLICT` (ya tiene una activa) |
| `updateApplicationStep1` | `Step1Schema` (partial) | `ClubApplication` | `VALIDATION.FAILED` |
| `updateApplicationStep2` | `Step2Schema` (partial) | `ClubApplication` | id |
| `updateApplicationStep3Meta` | `{cancellationPolicy, weeklyHours}` | `ClubApplication` | id |
| `addApplicationCourt` | `ApplicationCourtCreate` | `ApplicationCourt` | `VALIDATION.FAILED` |
| `updateApplicationCourt` | `{id, patch}` | `ApplicationCourt` | id |
| `removeApplicationCourt` | `{id}` | `void` | id |
| `uploadApplicationDocument` | `{applicationId, kind, file}` (FormData) | `ApplicationDocument` | `VALIDATION.FAILED` (mime, size) |
| `removeApplicationDocument` | `{id}` | `void` | id |
| `uploadApplicationPhoto` | `{applicationId, file, ordinal?}` (FormData) | `ApplicationPhoto` | `VALIDATION.FAILED` (max 6) |
| `removeApplicationPhoto` | `{id}` | `void` | id |
| `submitApplication` | `{applicationId, termsAccepted: true}` | `ClubApplication` (status='submitted') | `CLUB_APP.STEP_INVALID` (campos faltantes), `VALIDATION.FAILED` (terms) |
| `withdrawApplication` | `{applicationId, reason?}` | `ClubApplication` (status='withdrawn') | id |
| **admin** `startDocsReview` | `{applicationId}` | `ClubApplication` (status='docs_review') | `CLUB_APP.TRANSITION_FORBIDDEN` |
| **admin** `approveApplicationDocument` | `{documentId}` | `ApplicationDocument` | – |
| **admin** `rejectApplicationDocument` | `{documentId, reason}` | `ApplicationDocument` | – |
| **admin** `scheduleFieldVerification` | `{applicationId, scheduledAt, notes?}` | `ClubApplication` (status='field_verification') | id |
| **admin** `markFieldVerified` | `{applicationId, notes?}` | `ClubApplication` | id |
| **admin** `startFinalReview` | `{applicationId}` | `ClubApplication` (status='final_review') | id |
| **admin** `approveApplication` | `{applicationId}` | `{application, clubId}` (llama `fn_materialize_club_from_application`) | `CLUB_APP.TRANSITION_FORBIDDEN` |
| **admin** `rejectApplication` | `{applicationId, reason}` | `ClubApplication` (status='rejected') | id |
| **admin** `addReviewerNote` | `{applicationId, note}` | `ClubApplicationEvent` | – |

#### Route Handlers REST

| Method | Path | Body | Resp | Server Action |
|---|---|---|---|---|
| `GET` | `/api/v1/me/club-application` | – | `ClubApplication?` | `getMyApplication` |
| `POST` | `/api/v1/club-applications` | – | `ClubApplication` | `createApplication` |
| `GET` | `/api/v1/club-applications/:id` | – | `ClubApplication + courts + docs + photos + events` | – |
| `PATCH` | `/api/v1/club-applications/:id` | `{step, data}` discriminated | `ClubApplication` | dispatcher a updateApplicationStep1..3Meta |
| `DELETE` | `/api/v1/club-applications/:id` | `{reason?}` | `void` (withdraw) | `withdrawApplication` |
| `POST` | `/api/v1/club-applications/:id/courts` | `ApplicationCourtCreate` | `ApplicationCourt` | `addApplicationCourt` |
| `PATCH` | `/api/v1/club-applications/:id/courts/:courtId` | partial | `ApplicationCourt` | `updateApplicationCourt` |
| `DELETE` | `/api/v1/club-applications/:id/courts/:courtId` | – | `void` | `removeApplicationCourt` |
| `POST` | `/api/v1/club-applications/:id/documents` (multipart) | `{kind, file}` | `ApplicationDocument` | `uploadApplicationDocument` |
| `DELETE` | `/api/v1/club-applications/:id/documents/:docId` | – | `void` | `removeApplicationDocument` |
| `POST` | `/api/v1/club-applications/:id/photos` (multipart) | `{file, ordinal?}` | `ApplicationPhoto` | `uploadApplicationPhoto` |
| `DELETE` | `/api/v1/club-applications/:id/photos/:photoId` | – | `void` | `removeApplicationPhoto` |
| `POST` | `/api/v1/club-applications/:id/submit` | `{termsAccepted:true}` | `ClubApplication` | `submitApplication` |
| `GET` | `/api/v1/admin/club-applications` | `?status=&q=` | `ClubApplication[]` | – |
| `POST` | `/api/v1/admin/club-applications/:id/transitions/docs-review` | – | `ClubApplication` | `startDocsReview` |
| `POST` | `/api/v1/admin/club-applications/:id/documents/:docId/approve` | – | `ApplicationDocument` | `approveApplicationDocument` |
| `POST` | `/api/v1/admin/club-applications/:id/documents/:docId/reject` | `{reason}` | `ApplicationDocument` | `rejectApplicationDocument` |
| `POST` | `/api/v1/admin/club-applications/:id/transitions/field-verification` | `{scheduledAt, notes?}` | `ClubApplication` | `scheduleFieldVerification` |
| `POST` | `/api/v1/admin/club-applications/:id/transitions/field-verified` | `{notes?}` | `ClubApplication` | `markFieldVerified` |
| `POST` | `/api/v1/admin/club-applications/:id/transitions/final-review` | – | `ClubApplication` | `startFinalReview` |
| `POST` | `/api/v1/admin/club-applications/:id/transitions/approve` | – | `{application, clubId}` | `approveApplication` |
| `POST` | `/api/v1/admin/club-applications/:id/transitions/reject` | `{reason}` | `ClubApplication` | `rejectApplication` |
| `POST` | `/api/v1/admin/club-applications/:id/notes` | `{note}` | `ClubApplicationEvent` | `addReviewerNote` |

---

## 4. Dominio · courts

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/clubs/:clubId/courts` | – | `Court[]` | public |
| `GET` | `/api/v1/courts/:id` | – | `Court + pricing + blocks` | public |
| `POST` | `/api/v1/courts` | `CourtCreateSchema` | `Court` | club staff |
| `PATCH` | `/api/v1/courts/:id` | `CourtUpdateSchema` | `Court` | club staff |
| `DELETE` | `/api/v1/courts/:id` | – | `void` | club staff |
| `POST` | `/api/v1/courts/:id/pricing` | `CourtPricingCreate` | `CourtPricing` | club staff |
| `POST` | `/api/v1/courts/:id/blocks` | `CourtBlockCreate` | `CourtBlock` | club staff |
| `DELETE` | `/api/v1/courts/:id/blocks/:blockId` | – | `void` | club staff |
| `GET` | `/api/v1/courts/:id/availability` | `?from=&to=&slotMinutes=` | `AvailabilitySlot[]` | public |

Server Actions: `createCourt`, `updateCourt`, `archiveCourt`, `setCourtPricing`, `blockCourt`, `unblockCourt`.

---

## 5. Dominio · reservations

| Method | Path | Body | Resp | Scope | Errors |
|---|---|---|---|---|---|
| `GET` | `/api/v1/reservations` | `?clubId=&from=&to=&status=` | `Reservation[]` | self/staff | – |
| `GET` | `/api/v1/reservations/:id` | – | `Reservation + participants + payments` | self/staff | – |
| `POST` | `/api/v1/reservations` | `ReservationCreateSchema` | `Reservation` | user | `RESERVATION.SLOT_TAKEN`, `RESERVATION.WINDOW_CLOSED` |
| `PATCH` | `/api/v1/reservations/:id` | `ReservationUpdateSchema` | `Reservation` | organizer/staff | – |
| `POST` | `/api/v1/reservations/:id/cancel` | `{reason?}` | `Reservation` | organizer/staff | `RESERVATION.WINDOW_CLOSED` |
| `POST` | `/api/v1/reservations/:id/participants` | `{userId}` | `ReservationParticipant` | organizer | – |
| `DELETE` | `/api/v1/reservations/:id/participants/:userId` | – | `void` | organizer/self | – |
| `POST` | `/api/v1/reservations/:id/join` | – | `ReservationParticipant` | user (public visibility) | – |
| `POST` | `/api/v1/walkins` | `WalkinCreateSchema` | `Walkin + Reservation` | employee/manager | – |

Server Actions: `createReservation` (idempotent), `cancelReservation`, `joinReservation`, `inviteToReservation`, `createWalkin`.

---

## 6. Dominio · checkins

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `POST` | `/api/v1/checkins/scan` | `{qrCode}` (`Idempotency-Key`) | `CheckIn + Reservation` | employee/manager |
| `POST` | `/api/v1/checkins/manual` | `{reservationId\|sessionId, userId?}` | `CheckIn` | employee/manager |
| `POST` | `/api/v1/reservations/:id/no-show` | – | `Reservation` | employee/manager |
| `GET` | `/api/v1/checkins/queue` | `?clubId=` | `Reservation[]` (próximos 2h) | employee/manager |

---

## 7. Dominio · cash (POS)

| Method | Path | Body | Resp | Scope | Errors |
|---|---|---|---|---|---|
| `GET` | `/api/v1/cash/sessions` | `?clubId=&status=` | `CashSession[]` | club staff | – |
| `POST` | `/api/v1/cash/sessions/open` | `{clubId, openingFloatCents}` | `CashSession` | employee/manager | `CASH.SESSION_ALREADY_OPEN` |
| `POST` | `/api/v1/cash/sessions/:id/close` | `{closingCountedCents, notes?}` | `CashSession` | employee/manager | – |
| `POST` | `/api/v1/cash/sessions/:id/movements` | `{kind, amountCents, reason}` | `CashMovement` | employee/manager | – |
| `GET` | `/api/v1/transactions` | `?clubId=&from=&to=&kind=` | `Transaction[]` | staff/admin | – |
| `POST` | `/api/v1/transactions` | `TransactionCreateSchema` (`Idempotency-Key`) | `Transaction` | employee/coach | `CASH.SESSION_CLOSED`, `PAYMENT.CARD_DECLINED` |
| `POST` | `/api/v1/transactions/:id/refund` | `{amountCents, reason}` | `Refund` | manager/admin | – |
| `GET` | `/api/v1/cash/reports/z/:sessionId` | – | `CashZReport` (PDF link) | manager/admin | – |

---

## 8. Dominio · proshop

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/products` | `?clubId=&q=&category=` | `Product[]` | public |
| `GET` | `/api/v1/products/:id` | – | `Product` | public |
| `POST` | `/api/v1/products` | `ProductCreate` | `Product` | club staff |
| `PATCH` | `/api/v1/products/:id` | `ProductUpdate` | `Product` | club staff |
| `POST` | `/api/v1/products/:id/inventory` | `{delta, reason}` | `InventoryMovement` | club staff |
| `GET` | `/api/v1/me/cart` | – | `Cart` | user |
| `POST` | `/api/v1/me/cart/items` | `{productId, qty}` | `CartItem` | user |
| `PATCH` | `/api/v1/me/cart/items/:productId` | `{qty}` | `CartItem` | user |
| `DELETE` | `/api/v1/me/cart/items/:productId` | – | `void` | user |
| `POST` | `/api/v1/me/cart/checkout` | `{method}` (`Idempotency-Key`) | `Sale + Transaction` | user |
| `POST` | `/api/v1/sales` | `SaleCreate` (presencial) | `Sale + Transaction` | employee |

---

## 9. Dominio · coaches

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/coaches` | `?clubId=&sport=&specialty=` | `CoachProfile[]` | public |
| `GET` | `/api/v1/coaches/:id` | – | `CoachProfile + clubs + specialties + availability + certifications + reviews` | public |
| `PATCH` | `/api/v1/coaches/me` | `CoachProfileUpdate` | `CoachProfile` | coach (self) |
| `PUT` | `/api/v1/coaches/me/availability` | `Availability[]` | `Availability[]` | coach |
| `POST` | `/api/v1/coaches/me/certifications` | `CertificationCreate` | `Certification` | coach |
| `POST` | `/api/v1/coaches/:id/reviews` | `{rating, comment}` | `CoachReview` | user (with past lesson) |

---

## 10. Dominio · classes

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/classes` | `?clubId=&coachId=&sport=` | `Class[]` | public |
| `GET` | `/api/v1/classes/:id` | – | `Class + nextSessions[]` | public |
| `POST` | `/api/v1/classes` | `ClassCreate` | `Class` | coach/staff |
| `PATCH` | `/api/v1/classes/:id` | `ClassUpdate` | `Class` | coach owner/staff |
| `POST` | `/api/v1/classes/:id/sessions` | `SessionCreate` | `ClassSession` | coach |
| `POST` | `/api/v1/classes/:id/enroll` | `{studentId?}` | `ClassEnrollment + Transaction` | user/coach |
| `POST` | `/api/v1/class-enrollments/:id/cancel` | – | `ClassEnrollment` | student/coach |
| `GET` | `/api/v1/me/classes` | `?from=&to=` | `ClassEnrollment[]` | user |
| `POST` | `/api/v1/lessons` | `LessonBook` | `Lesson1on1 + Transaction` | user |
| `POST` | `/api/v1/lessons/:id/cancel` | – | `Lesson1on1` | student/coach |
| `POST` | `/api/v1/class-sessions/:id/attendance` | `[{studentId, attended}]` | `Attendance[]` | coach |

---

## 11. Dominio · students

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/coaches/me/students` | – | `Student[]` (con progress) | coach |
| `GET` | `/api/v1/students/:id` | – | `StudentDetail` | coach with relationship |
| `PUT` | `/api/v1/students/:id/progress` | `{skill, currentLevel, targetLevel?}` | `StudentProgress` | coach |
| `POST` | `/api/v1/students/:id/evaluations` | `EvaluationCreate` | `Evaluation` | coach |
| `POST` | `/api/v1/students/:id/notes` | `{body, visibility}` | `StudentNote` | coach |
| `GET` | `/api/v1/me/progress` | – | `StudentProgress[]` | user |

---

## 12. Dominio · resources

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/resources` | `?coachId=&kind=&tag=` | `Resource[]` | self (granted) + own |
| `GET` | `/api/v1/resources/:id` | – | `Resource + files[]` | granted |
| `POST` | `/api/v1/resources` | `ResourceCreate` | `Resource` | coach |
| `PATCH` | `/api/v1/resources/:id` | partial | `Resource` | coach owner |
| `POST` | `/api/v1/resources/:id/files` (multipart) | `{file}` | `ResourceFile` | coach owner |
| `POST` | `/api/v1/resources/:id/access` | `{userId?, classId?}` | `ResourceAccess` | coach owner |
| `POST` | `/api/v1/resources/:id/views` | `{progressPct}` | `ResourceView` | user with access |

---

## 13. Dominio · messaging

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/conversations` | `?kind=&unread=` | `Conversation[]` (con lastMessage + unreadCount) | self |
| `POST` | `/api/v1/conversations` | `{kind, memberIds[], title?, clubId?}` | `Conversation` | user |
| `GET` | `/api/v1/conversations/:id` | – | `Conversation + members[]` | member |
| `GET` | `/api/v1/conversations/:id/messages` | `?before=&after=&limit=` | `Message[]` | member |
| `POST` | `/api/v1/conversations/:id/messages` | `MessageCreate` | `Message` | member |
| `PATCH` | `/api/v1/messages/:id` | `{body}` | `Message` | sender (15 min window) |
| `DELETE` | `/api/v1/messages/:id` | – | `void` (soft delete) | sender/admin |
| `POST` | `/api/v1/conversations/:id/read` | `{lastMessageId}` | `void` | member |
| `POST` | `/api/v1/conversations/:id/members` | `{userId}` | `Member` | admin del chat |
| `DELETE` | `/api/v1/conversations/:id/members/:userId` | – | `void` | self / admin |

Server Actions equivalentes: `startConversation`, `sendMessage` (idempotent), `editMessage`, `deleteMessage`, `markRead`, `addMember`, `leaveConversation`.

---

## 14. Dominio · friends

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/me/friends` | `?q=` | `Friend[]` | self |
| `POST` | `/api/v1/friends/requests` | `{toUserId}` | `FriendRequest` | user |
| `GET` | `/api/v1/me/friend-requests` | `?direction=incoming\|outgoing` | `FriendRequest[]` | self |
| `POST` | `/api/v1/friends/requests/:id/accept` | – | `Friendship` | recipient |
| `POST` | `/api/v1/friends/requests/:id/reject` | – | `void` | recipient |
| `DELETE` | `/api/v1/friends/:userId` | – | `void` | self |
| `POST` | `/api/v1/blocks` | `{userId, reason?}` | `Block` | user |
| `DELETE` | `/api/v1/blocks/:userId` | – | `void` | self |

---

## 15. Dominio · teams

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/teams` | `?q=&sport=&captainId=` | `Team[]` | public |
| `GET` | `/api/v1/teams/:id` | – | `Team + members + invites` | member/captain |
| `POST` | `/api/v1/teams` | `TeamCreate` | `Team` | user |
| `PATCH` | `/api/v1/teams/:id` | partial | `Team` | captain |
| `DELETE` | `/api/v1/teams/:id` | – | `void` | captain |
| `POST` | `/api/v1/teams/:id/invites` | `{userId}` | `TeamInvite` | captain |
| `POST` | `/api/v1/team-invites/:id/accept` | – | `TeamMember` | invitee |
| `POST` | `/api/v1/team-invites/:id/reject` | – | `void` | invitee |
| `DELETE` | `/api/v1/teams/:id/members/:userId` | – | `void` | captain / self |

---

## 16. Dominio · ranking

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/ranking` | `?sport=&level=&country=&city=&limit=` | `RankingEntry[]` | public |
| `GET` | `/api/v1/users/:id/ranking-history` | `?sport=&from=&to=` | `RankingSnapshot[]` | public |
| `POST` | `/api/v1/matches/results` | `MatchResultReport` | `MatchResult` | participant |
| `POST` | `/api/v1/matches/results/:id/confirm` | – | `MatchResult` | other participants |
| `POST` | `/api/v1/matches/results/:id/dispute` | `{reason}` | `MatchResult` | any participant |

---

## 17. Dominio · tournaments

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/leagues` | – | `League[]` | public |
| `POST` | `/api/v1/leagues` | `LeagueCreate` | `League` | partner |
| `GET` | `/api/v1/tournaments` | `?leagueId=&sport=&from=` | `Tournament[]` | public |
| `GET` | `/api/v1/tournaments/:id` | – | `Tournament + categories + counts` | public |
| `POST` | `/api/v1/tournaments` | `TournamentCreate` | `Tournament` | partner |
| `POST` | `/api/v1/tournaments/:id/categories` | `CategoryCreate` | `Category` | partner |
| `POST` | `/api/v1/tournaments/:id/register` | `RegistrationCreate` (`Idempotency-Key`) | `Registration + Transaction` | user |
| `GET` | `/api/v1/tournaments/:id/registrations` | – | `Registration[]` | partner |
| `POST` | `/api/v1/registrations/:id/accept` | – | `Registration` | partner |
| `POST` | `/api/v1/registrations/:id/reject` | `{reason}` | `Registration` | partner |
| `POST` | `/api/v1/registrations/:id/withdraw` | – | `Registration` | self/partner |
| `POST` | `/api/v1/tournaments/:id/brackets/generate` | `{categoryId, seedingMode}` | `Bracket` | partner |
| `GET` | `/api/v1/brackets/:id` | – | `Bracket + matches[]` | public |
| `PATCH` | `/api/v1/bracket-matches/:id/schedule` | `{scheduledAt, courtId?}` | `BracketMatch` | partner |
| `PATCH` | `/api/v1/bracket-matches/:id/score` | `{winnerSide, score}` | `BracketMatch + MatchResult` | partner/players |

---

## 18. Dominio · events

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/events` | `?clubId=&kind=&from=` | `Event[]` | public |
| `GET` | `/api/v1/events/:id` | – | `Event + counts` | public |
| `POST` | `/api/v1/events` | `EventCreate` | `Event` | owner/manager/partner |
| `PATCH` | `/api/v1/events/:id` | partial | `Event` | organizer |
| `POST` | `/api/v1/events/:id/publish` | – | `Event` | organizer |
| `POST` | `/api/v1/events/:id/register` | (`Idempotency-Key`) | `EventRegistration + Transaction?` | user |
| `DELETE` | `/api/v1/event-registrations/:id` | – | `void` | self |
| `POST` | `/api/v1/event-registrations/:id/check-in` | – | `EventCheckIn` | organizer/employee |

---

## 19. Dominio · notifications

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/notifications` | `?role=&unread=&before=&limit=` | `Notification[]` | self |
| `GET` | `/api/v1/notifications/unread-count` | `?role=` | `{count}` | self |
| `POST` | `/api/v1/notifications/:id/read` | – | `Notification` | self |
| `POST` | `/api/v1/notifications/read-all` | `{role}` | `{count}` | self |
| `GET` | `/api/v1/me/notification-preferences` | `?role=` | `Preference[]` | self |
| `PATCH` | `/api/v1/me/notification-preferences` | `{role, kind, channel, enabled}[]` | `Preference[]` | self |
| `GET` | `/api/v1/notification-kinds` | – | `Kind[]` | authenticated |
| `POST` | `/api/v1/notifications/subscriptions` | `{endpoint, p256dh, auth, ua?}` | `Subscription` | self |
| `DELETE` | `/api/v1/notifications/subscriptions/:id` | – | `void` | self |

Server-side internal: `enqueueNotification({userId, role, kind, payload})` — usado por **todo** server action que produce notifs. Vive en `src/lib/notifications/dispatch.ts`, valida contra `NOTIFICATION_KINDS` y la tabla `notification_preferences` antes de insertar `notification_jobs`.

---

## 20. Dominio · marketing (broadcasts)

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/broadcasts` | `?scope=&clubId=&status=` | `Broadcast[]` | owner/admin/partner |
| `POST` | `/api/v1/broadcasts` | `BroadcastCreate` | `Broadcast` (status='draft') | owner/admin/partner |
| `POST` | `/api/v1/broadcasts/:id/preview` | – | `{audienceCount, sample[]}` | author |
| `POST` | `/api/v1/broadcasts/:id/schedule` | `{scheduledFor}` | `Broadcast` | author |
| `POST` | `/api/v1/broadcasts/:id/send` | – | `Broadcast` (status='sending') | author |
| `POST` | `/api/v1/broadcasts/:id/cancel` | – | `Broadcast` | author |

---

## 21. Dominio · moderation / audit

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `POST` | `/api/v1/reports` | `{entity, entityId, reason, details?}` | `Report` | user |
| `GET` | `/api/v1/admin/reports` | `?status=` | `Report[]` | admin |
| `POST` | `/api/v1/admin/reports/:id/act` | `{action, durationHours?, reason}` | `ModerationAction` | admin |
| `POST` | `/api/v1/admin/reports/:id/dismiss` | `{reason}` | `Report` | admin |
| `GET` | `/api/v1/admin/audit` | `?entity=&entityId=&actorId=&clubId=&from=&to=` | `AuditEntry[]` | admin/owner |

---

## 22. Dominio · support

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/tickets` | `?status=&clubId=` | `Ticket[]` | self/staff/admin |
| `GET` | `/api/v1/tickets/:id` | – | `Ticket + messages` | involved |
| `POST` | `/api/v1/tickets` | `TicketCreate` | `Ticket` | user |
| `POST` | `/api/v1/tickets/:id/messages` | `{body, internal?}` | `TicketMessage` | involved |
| `POST` | `/api/v1/tickets/:id/assign` | `{assigneeId}` | `Ticket` | staff/admin |
| `POST` | `/api/v1/tickets/:id/close` | `{resolution?}` | `Ticket` | staff/admin |
| `POST` | `/api/v1/tickets/:id/reopen` | – | `Ticket` | opener/admin |

---

## 23. Dominio · feature-flags

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/flags` | – | `FeatureFlag[]` | admin |
| `POST` | `/api/v1/admin/flags` | `{key, description, rolloutPct?}` | `FeatureFlag` | admin |
| `PATCH` | `/api/v1/admin/flags/:key` | partial | `FeatureFlag` | admin |
| `POST` | `/api/v1/admin/flags/:key/assignments` | `{scope, scopeId, enabled, reason?}` | `Assignment` | admin |
| `GET` | `/api/v1/me/flags` | – | `Record<string, boolean>` | authenticated |

---

## 24. Dominio · partners

| Method | Path | Body | Resp | Scope |
|---|---|---|---|---|
| `GET` | `/api/v1/partners` | – | `Partner[]` | admin |
| `GET` | `/api/v1/partners/:id` | – | `Partner + members + clubLinks` | member/admin |
| `POST` | `/api/v1/partners` | `PartnerCreate` | `Partner` | admin |
| `POST` | `/api/v1/partners/:id/members` | `{userId, role}` | `PartnerMember` | partner-admin |
| `POST` | `/api/v1/partners/:id/clubs/:clubId/link` | `{revenueSharePct}` | `PartnerClubLink` | partner-admin + club-owner approval |
| `DELETE` | `/api/v1/partners/:id/clubs/:clubId` | – | `void` | partner-admin / club-owner |

---

## 25. Webhooks

| Method | Path | Body | Notas |
|---|---|---|---|
| `POST` | `/api/webhooks/stripe` | Stripe signature | idempotente, valida con `stripe-signature` |
| `POST` | `/api/webhooks/mercadopago` | MP signature | idempotente |
| `POST` | `/api/webhooks/push-receipts` | – | tracking de delivery push |

---

## 26. Health / meta

| Method | Path | Resp | Notas |
|---|---|---|---|
| `GET` | `/api/v1/health` | `{status, db, version}` | público |
| `GET` | `/api/v1/version` | `{api, build, sha}` | público |
| `GET` | `/api/v1/openapi.json` | OpenAPI 3.1 spec | autogenerada (ver `60-openapi.md`) |

---

## 27. Total endpoints

Aproximado **~165 endpoints REST** + **~100 Server Actions** (varios endpoints REST son thin wrappers de Server Actions). Cobertura completa de las 18 áreas de dominio + auth + webhooks + health.

Próximo: `50-realtime.md` (canales, payloads, suscripciones).
