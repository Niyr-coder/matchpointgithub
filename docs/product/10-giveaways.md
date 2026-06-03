# Giveaways v2 · sorteos con mecánicas y feed del club

> **Leer antes de tocar** cualquier código de sorteos, feed del club o
> componentes en `src/components/giveaways/`. v2 extiende la base de
> [09-club-comms-giveaways.md](./09-club-comms-giveaways.md) (canal de
> anuncios + notifs) con perfil feed-céntrico, entradas ponderadas y sorteo
> en vivo. Design handoff: `design_handoff_club_giveaways/`.

---

## 1. Decisiones bloqueadas (v2)

| Tema | Decisión |
|---|---|
| Perfil del club | **Variante A feed-céntrico** por defecto — tab Feed primero, luego Eventos, Reservar, Sobre el club |
| Feed | **Solo staff publica** posts (`GIVEAWAY`, `TORNEO`, `RESULTADO`, `FOTO`, `AVISO`, `SPOTLIGHT`). **Sin UGC ni comentarios en v1** — la UI puede mostrar iconos de like/comentario deshabilitados u ocultos, pero no persisten |
| Entradas | Catálogo de **mecánicas** con peso configurable; cada jugador acumula `total_entries` |
| Cierre | Countdown dual: **`closes_at`** (deja de sumar entradas) y **`draw_at`** (hora del sorteo) |
| Sorteo | **Weighted Fisher-Yates en servidor** (autoritativo). Cliente reproduce animación ~**3 s** (cosmética). Dispara **auto** al llegar `draw_at` **o** botón manual del staff |
| Perdedores | **Sin premio de consolación** — copy honesto: ganaste / no fue esta vez |
| v1 chat | El canal `club_announcements` sigue existiendo para push + deep-link; el descubrimiento principal pasa al **feed del perfil** |

---

## 2. Modelo de datos

### `club_giveaways` (extendida)

Parte de la tabla v1 (`20260605150000`). v2 agrega columnas y semántica nueva:

| Columna | Tipo | Notas |
|---|---|---|
| `id`, `club_id`, `created_by` | uuid | Igual v1 |
| `feed_post_id` | uuid → `club_feed_posts` | Post staff que anuncia el sorteo (reemplaza `message_id` como superficie principal) |
| `message_id` | uuid nullable | Opcional — mirror en canal anuncios para notif `club_announcement_new` |
| `conversation_id` | uuid | Canal anuncios del club (sync con [09](./09-club-comms-giveaways.md)) |
| `title`, `description`, `prize_label` | text | Copy del premio |
| `eligibility` | text | `followers \| members \| all` — helper `isGiveawayEligible` |
| `owner_kind` | text | `club \| partner \| matchpoint` — badge en UI |
| `status` | text | `draft → open → closed → drawn \| cancelled` |
| `max_winners` | int | 1–20 |
| `opens_at`, `closes_at` | timestamptz | Ventana para sumar entradas |
| `draw_at` | timestamptz | Hora programada del sorteo en vivo |
| `drawn_at` | timestamptz | Timestamp real cuando el servidor ejecutó el draw |
| `mechanics_config` | jsonb | Mecánicas activas + pesos + caps (ver §4) |
| `rules` | jsonb | Lista de strings mostrada en detalle |
| `created_at`, `updated_at` | timestamptz | Trigger `tg_set_updated_at` |

Estados:

```
draft ──► open ──► closed ──► drawn
  │         │         │
  └─────────┴─────────┴──► cancelled
```

- `open`: acepta entradas mientras `now() < closes_at` (si `closes_at` definido).
- `closed`: pasó `closes_at`, aún no se sortea — espera `draw_at` o trigger manual.
- `drawn`: ganadores persistidos en `club_giveaway_winners`.

### `club_feed_posts` (nueva)

Feed staff-only del club. Un post puede referenciar entidades (`giveaway_id`, `tournament_id`, etc.).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `club_id` | uuid FK | |
| `created_by` | uuid FK profiles | Solo owner/manager |
| `badge` | text | `GIVEAWAY \| TORNEO \| RESULTADO \| FOTO \| AVISO \| SPOTLIGHT` |
| `title`, `body` | text | |
| `image_url` | text nullable | Storage |
| `payload` | jsonb | IDs enlazados, chips, CTA |
| `giveaway_id` | uuid nullable FK | Si `badge = GIVEAWAY` |
| `published_at` | timestamptz | Orden del feed |
| `created_at` | timestamptz | |

**RLS**: SELECT miembros elegibles del club (seguidores + VIP + staff); INSERT/UPDATE/DELETE solo staff (`fn_is_club_announcements_publisher` o equivalente).

### `club_giveaway_entries` (extendida)

| Columna | Tipo | Notas |
|---|---|---|
| `giveaway_id`, `user_id` | uuid PK compuesta | Una fila por jugador |
| `entered_at` | timestamptz | Primera participación |
| `total_entries` | int ≥ 1 | **Suma ponderada** de mecánicas completadas |

v1 solo insertaba fila (= 1 entrada). v2 **actualiza** `total_entries` cada vez que progresa una mecánica.

### `club_giveaway_mechanic_progress` (nueva)

Progreso granular por mecánica y jugador.

| Columna | Tipo | Notas |
|---|---|---|
| `giveaway_id` | uuid FK | |
| `user_id` | uuid FK | |
| `mechanic_kind` | text | `follow \| reserve \| play \| share \| invite \| buy \| pay` |
| `status` | text | `pending \| done \| rejected` |
| `weight_awarded` | int | Entradas sumadas por esta mecánica |
| `evidence_url` | text nullable | Captura para `share` (validación manual) |
| `verified_by` | uuid nullable | Staff que aprobó/rechazó manual |
| `completed_at` | timestamptz nullable | |
| PK | | `(giveaway_id, user_id, mechanic_kind)` |

### `club_giveaway_winners` (sin cambios)

Igual v1: `(giveaway_id, user_id, rank, notified_at)`.

---

## 3. Rutas y superficies

| Ruta | Rol | Qué muestra |
|---|---|---|
| `/dashboard/clubes/[slug]` | user (+ staff) | Perfil club **variante A**: hero + tabs con **Feed** default. Posts staff + rail de sorteos activos (`GiveawayMiniCard`) |
| `/dashboard/user/giveaways/[id]` | user | Detalle del sorteo: hero emerald, mecánicas, countdown `closes_at`/`draw_at`, CTA participar |
| `/dashboard/user/mis-sorteos` | user | Tracker: sorteos donde participa, entradas propias, estado, countdown |
| `/dashboard/owner/club-sorteos` | owner | Dashboard staff: wizard crear, tabla activos/borradores/cerrados, gestión, botón sortear |
| `/dashboard/manager/club-sorteos` | manager | Igual owner |

Sidebar staff: sección **Sorteos** (`club-sorteos`). v1 usaba `club-anuncios` para crear sorteos simples — v2 concentra CRUD en `club-sorteos`; anuncios de texto siguen en `club-anuncios`.

Componentes UI (primitivos del handoff → `src/components/giveaways/`):

- `FeedPostCard`, `GiveawayMiniCard`, `MechanicRow`, `Countdown`, `GiveawayWizardSteps`, `MiniStat`, `OwnerBadge`

Tokens CSS: `--gw-accent`, `hero-emerald`, `chip-emerald` en `globals.css`.

---

## 4. Catálogo de mecánicas

Fuente única: `src/components/giveaways/mechanic-catalog.ts` (`MECHANIC_CATALOG`).

| kind | Label | Peso default | Auto | Regla de negocio |
|---|---|---:|---|---|
| `follow` | Seguir al club | 1 | ✅ | Ya sigue al publicar o al completar acción |
| `reserve` | Reservar una hora | 2 | ✅ | Reserva **completada** (`status = captured`) en el club |
| `play` | Jugar torneo o quedada | 2 | ✅ | Asistió a evento del club en ventana del sorteo |
| `share` | Compartir en stories | 1 | ❌ | Staff valida captura (`evidence_url`) |
| `invite` | Invitar amigos | 2 | ✅ | Amigo nuevo registrado vía ref; **max 3** |
| `buy` | Comprar en pro-shop | 3 | ✅ | Tx `captured` > $20 en el club |
| `pay` | Pagar ticket extra | 1 | ✅ | $1 por entrada vía tx dedicada; **max 10** |

El organizador elige subconjunto + override de peso en `mechanics_config`. Al marcar `done`:

1. Upsert en `club_giveaway_mechanic_progress`.
2. Recalcular `club_giveaway_entries.total_entries` = Σ `weight_awarded` donde `status = done`.
3. Si no existía fila en entries → insert con `entered_at = now()`.

**Participar** = al menos 1 entrada (típicamente `follow` o primera mecánicas obligatorias del wizard).

---

## 5. Flujos

### 5.1 Organizador — crear (wizard 4 pasos)

```
Premio → Mecánica → Reglas y fechas → Publicar
```

1. **Premio**: foto, título, valor, `owner_kind`, elegibilidad.
2. **Mecánica**: toggles del catálogo + pesos.
3. **Reglas y fechas**: `opens_at`, `closes_at`, `draw_at`, reglas libres, `max_winners`.
4. **Publicar**: preview `FeedPostCard` + INSERT giveaway + feed post + (opcional) mirror `giveaway_post` en anuncios.

Server action prevista: `createClubGiveawayV2` en módulo giveaways (puede extender `club-comms.ts`).

### 5.2 Jugador — participar

```
Feed del club / Mis sorteos / Push
  → Detalle /dashboard/user/giveaways/[id]
  → "Participar gratis" (crea entry si elegible)
  → Completar mecánicas (MechanicRow)
  → Tracker en /dashboard/user/mis-sorteos
```

Deep-link notif: `giveaway_id` → `/dashboard/user/giveaways/[id]`.

### 5.3 Sorteo en vivo

**Servidor (autoritativo)**:

1. Job cron o RPC `fn_draw_club_giveaway(giveaway_id)` cuando `now() >= draw_at` **o** staff llama `drawClubGiveawayWinners`.
2. Validar `status IN ('open','closed')` y `now() >= closes_at` (si definido).
3. Construir pool expandido: por cada entry, repetir `user_id` **`total_entries` veces**.
4. **Weighted Fisher-Yates** sobre el pool; tomar primeros `max_winners` user_ids únicos (si un user gana rank 1, no repetir en rank 2 salvo que `max_winners > 1` y el diseño lo permita — default: sin repetición).
5. Persistir winners, `status = drawn`, `drawn_at = now()`.
6. Post feed `RESULTADO` + mensaje `giveaway_result` en anuncios.
7. Notif `giveaway_won` a ganadores. **Sin notif/premio** a perdedores.

**Cliente (cosmético ~3 s)**:

- Pantalla/modal "Sorteo en vivo" con animación de nombres/avatars girando.
- Al terminar animación, fetch estado final — **nunca** elige ganador en cliente.
- Si el user llega tarde, salta animación y muestra resultado ya persistido.

Triggers:

| Modo | Cuándo |
|---|---|
| Auto | Cron/pg_cron al pasar `draw_at` |
| Manual | Staff en `club-sorteos` — permitido desde `draw_at` o override staff con audit |

---

## 6. Notificaciones

Además de las de [09 § Notificaciones](./09-club-comms-giveaways.md):

| Kind | Cuándo | Deep-link |
|---|---|---|
| `club_announcement_new` | Publicación del sorteo (mirror anuncios) | `conversation_id` → chat |
| `giveaway_won` | Tras draw servidor | `/dashboard/user/giveaways/[id]` |
| `giveaway_draw_reminder` | ~30 min antes de `draw_at` (opcional v2.1) | `/dashboard/user/giveaways/[id]` |
| `giveaway_mechanic_pending` | Mecánica `share` enviada a revisión staff | panel staff |

Registrar kinds en migration + `fn_dispatch_inapp_notifications`. Ver `guides/02-notifications.md`.

---

## 7. Server actions (contrato previsto)

Archivo: `src/server/actions/club-comms.ts` (v1) + acciones v2 (mismo módulo o `giveaways.ts`):

| Action | Quién | Qué hace |
|---|---|---|
| `createClubGiveawayV2` | staff | Wizard → giveaway + feed post |
| `enterClubGiveaway` | user | Crea entry + mecánicas base (extendida v2) |
| `completeGiveawayMechanic` | user/system | Marca progreso, recalcula `total_entries` |
| `reviewGiveawayMechanic` | staff | Aprueba/rechaza `share` |
| `drawClubGiveawayWinners` | staff/cron | Weighted Fisher-Yates + notifs |
| `listClubFeedPosts` | user | Feed paginado del club |
| `listMyGiveaways` | user | Mis sorteos activos/histórico |
| `getClubGiveaway` | user | Detalle + mecánicas + progreso propio |
| `listClubGiveawaysStaff` | staff | Dashboard `club-sorteos` |

v1 `enterClubGiveaway` inserta 1 fila sin peso — **migrar** filas existentes con `total_entries = 1`.

---

## 8. Sincronía cross-superficie

Cuando mutas un sorteo o progreso de mecánica, los cambios deben verse en:

### Perfil del club (`/dashboard/clubes/[slug]`)
- Tab Feed: nuevo `FeedPostCard` al publicar; badge `GIVEAWAY` enlaza a detalle.
- Rail lateral: `GiveawayMiniCard` con countdown y contador participantes.
- Realtime opcional: suscripción `club_feed_posts` + `club_giveaways` filtrado por `club_id`.

### Detalle jugador (`/dashboard/user/giveaways/[id]`)
- Hero stats: participantes (= COUNT entries), tus entradas (`total_entries`), probabilidad = `my / sum(total_entries)`.
- `MechanicRow` refleja `club_giveaway_mechanic_progress` tras cada acción (reserva, pago, etc.).

### Mis sorteos (`/dashboard/user/mis-sorteos`)
- Lista derivada de `club_giveaway_entries` JOIN giveaways abiertos/cerrados.
- Countdown usa el mínimo relevante: si `now < closes_at` → cierra en; si no → sorteo en `draw_at`.

### Panel staff (`/dashboard/{owner|manager}/club-sorteos`)
- Tabla con entradas totales (= SUM `total_entries`), no solo COUNT usuarios.
- Botón **Sortear** habilitado cuando `status = closed` o `now >= draw_at`.
- Cola validación manual para mecánicas `share`.

### Canal anuncios (legacy v1)
- Mirror opcional: mensaje `giveaway_post` / `giveaway_result` sigue funcionando para usuarios que entren por Mensajes.
- `GiveawayMessageCard` en chat puede redirigir a `/dashboard/user/giveaways/[id]` en v2.

### Notificaciones + inbox
- Payload incluye `giveaway_id` para deep-link consistente.
- Tras draw: ganador ve resultado en detalle + notif; feed del club muestra post `RESULTADO`.

**Patrón**: si completas reserva y suma +2 entradas, deben actualizarse detalle, mis-sorteos y stats del staff sin reload manual (`router.refresh` o realtime).

Checklist completo: `qa/new-flow-cross-surface-checklist.md`.

---

## 9. Relación con v1 y doc 09

| Tema | v1 ([09](./09-club-comms-giveaways.md)) | v2 (este doc) |
|---|---|---|
| Descubrimiento | Canal anuncios + card en Mensajes | Feed del perfil club + mis-sorteos |
| Entrada | Botón → 1 fila en entries | Mecánicas → `total_entries` ponderado |
| Sorteo | Manual, 1 entrada = 1 ticket | Auto/manual, weighted pool |
| Creación | `club-anuncios` | `club-sorteos` wizard |
| Tablas nuevas | — | `club_feed_posts`, `club_giveaway_mechanic_progress` |

No eliminar canal anuncios ni triggers `fn_club_comms_sync_*` — siguen siendo la tubería de membresía/VIP descrita en 09.

---

## 10. Cosas que rompen seguido

1. **Sorteo en cliente** — la animación es decorativa; el ganador solo existe después del RPC servidor. Nunca usar `Math.random()` en UI para decidir.
2. **Confundir `closes_at` y `draw_at`** — `closes_at` bloquea mecánicas; `draw_at` dispara el draw. Pueden ser iguales pero semántica distinta.
3. **COUNT entries vs SUM total_entries** — KPI "entradas totales" usa **suma ponderada**; "participantes" usa COUNT DISTINCT users.
4. **Fisher-Yates sin expandir peso** — mezclar solo user_ids ignora entradas extra; hay que expandir el pool.
5. **Mecánica auto sin hook** — `reserve`/`play`/`buy`/`pay` necesitan listener post-acción (reservation captured, registration accepted, tx captured) que llame `completeGiveawayMechanic`.
6. **`share` sin cola staff** — queda `pending` forever; el staff debe verla en `club-sorteos`.
7. **RLS en progress/entries** — el jugador inserta su progress; staff aprueba manual; recalcular `total_entries` debe ser **transacción** o RPC `security definer` para evitar race conditions.
8. **Feed con comentarios** — decisión v1 de producto: **no persistir** likes/comentarios aunque el handoff los muestre. No cablear `FeedPostCard` comment form a DB.
9. **Olvidar mirror anuncios** — usuarios legacy entran por Mensajes; si no publicas `giveaway_post`, pierden el push unificado.
10. **Premio consolación** — explícitamente **fuera de scope**. Copy perdedor: "No fue esta vez" sin cupón ni crédito.
11. **Elegibilidad** — reutilizar `isGiveawayEligible`; VIP inactivo no cuenta para `members`.
12. **v1 `drawClubGiveawayWinners`** — mezcla uniforme 1:1; reemplazar por weighted en v2 sin romper sorteos ya `drawn`.

---

## 11. Migración desde v1

1. Migration: crear `club_feed_posts`, `club_giveaway_mechanic_progress`; ALTER `club_giveaways` + `club_giveaway_entries.total_entries`.
2. Backfill: giveaways existentes → `total_entries = 1`, `mechanic_progress` con `follow` done si ya tenían entry.
3. Backfill feed: por cada giveaway `open|drawn` con `message_id`, crear `club_feed_posts` equivalente.
4. UI: rutas nuevas; redirigir creación de sorteos de `club-anuncios` a `club-sorteos` (mantener listado legacy temporalmente si hace falta).

---

## 12. Referencias

- Comms + canal anuncios v1: [09-club-comms-giveaways.md](./09-club-comms-giveaways.md)
- Elegibilidad: `src/lib/clubs/comms-eligibility.ts`
- Catálogo mecánicas: `src/components/giveaways/mechanic-catalog.ts`
- Primitivos UI: `src/components/giveaways/`
- Acciones v1: `src/server/actions/club-comms.ts`
- Design handoff: `design_handoff_club_giveaways/` (overview, create, detail, club-web variant A)
- Notificaciones: `guides/02-notifications.md`
- Checklist QA: `qa/new-flow-cross-surface-checklist.md`
