# Ciclo de vida de matches (post-aceptación)

Acciones sobre un partido ya agendado. Nació de "Busco partido" pero aplica a
**todo** match (incluido el reto del RetarModal).

## Estados

`mp_match_status`: `scheduled → reported → confirmed | disputed`, más
`cancelled`. Reprogramar **no** cambia el estado (solo `played_at`).

## Acciones (src/server/actions/matches.ts)

- **`cancelMatch({ matchId, reason? })`** — solo participantes, solo desde
  `scheduled` o `reported`. Pasa el match a `cancelled` (con `cancelled_by`,
  `cancelled_reason`, `cancelled_at`), notifica al resto de participantes
  (`match_cancelled`) y, **si el match nació de un `match_seek`**, reabre el
  aviso (`matched → open`, `match_id = null`) siempre que no haya expirado.
  La postulación aceptada se marca `rejected`; el resto de postulantes sigue
  **`pending`** (quedaron en pausa al aceptar), así el autor puede elegir a
  otro sin republicar.
- **`rescheduleMatch({ matchId, playedAt })`** — solo participantes, solo
  `scheduled`, fecha futura. Actualiza `played_at` y notifica
  (`match_rescheduled`).

> El reabrir el aviso usa `getAdminClient` + `setAuditActor`: quien cancela
> puede NO ser el autor del seek, y la RLS de `match_seeks` solo deja mutar al
> autor. La identidad ya está validada (es participante del match).

## Cambio en acceptApplicant

Antes auto-rechazaba a los demás postulantes al aceptar a uno. **Ya no**:
quedan `pending` para sobrevivir a una cancelación y reapertura del aviso.

## Notificaciones

- `match_cancelled` → al otro jugador. Link al chat del partido (`?conv=`).
- `match_rescheduled` → al otro jugador. Link al chat.

Ver `guides/02-notifications.md §2`.

## Realtime

`matches` se sumó al publication (mig 121) — cancel/reschedule se reflejan en
vivo en el chat del partido y en "Mis avisos".

## UI

- **"Mis avisos"** (`BuscoPartidoScreenView` → `MineCard`): cuando el aviso
  está `matched`, muestra **Reprogramar** (modal date/time) y **Cancelar
  partido**. Cubre los matches nacidos de avisos.
- **Chat del partido** (`MensajesScreenView` → `MatchActionBar`): cuando la
  conversación es `kind='match'`, una barra arriba muestra cancelar/reprogramar
  (o el estado si ya no es accionable). Cubre **todos** los matches, incluido
  el reto del RetarModal. `MensajesScreen` thread-ea `activeMatch` (match_id +
  status del match de la conversación activa).

## Coordinación menor

"Voy tarde / cambiemos a tal cancha" se habla en el **chat del partido**
(`kind='match'`, ya existe). No agregamos estados para eso.

## No-show + fiabilidad (Stage 3 · backend listo, UI staged)

Detrás del flag **`match_reliability_enabled`** (mig 124, default OFF).

- **`player_reliability`** — contadores `no_shows`, `cancellations` por jugador.
- **`match_no_shows`** — un participante reporta que otro no apareció
  (unique por reporter+match+no-show; check no-self).
- **Action `reportNoShow({ matchId, noShowUserId })`** (`matches.ts`) — gated
  por el flag; solo participante, solo después de `played_at`, solo en
  `scheduled`/`reported`. Inserta el reporte (service role, RLS admin-only),
  incrementa el contador del reportado, notifica `match_no_show_reported`.
- **Score** — `src/lib/reliability.ts`: `reliabilityScore({noShows,cancellations})`
  = `clamp(100 - noShows*15 - cancellations*3, 0, 100)` + `reliabilityTier()`.

**UI**: ✅ fila "¿No apareció?" en el `MatchActionBar` del chat del partido
(gated por flag + `matchTimePassed` + un botón por cada otro participante →
`reportNoShow`). Pendiente: **badge de fiabilidad** en perfil / `AdminUsersScreen`.
Mientras el flag `match_reliability_enabled` esté OFF (default), no se ve.

**Admin (Ola 3):** `admin-matches` lista matches recientes, disputas, no-shows y
`player_reliability`. Soporte puede cancelar matches, cerrar disputas, descartar
reportes de no-show y editar contadores de fiabilidad.

**Cancelaciones abusivas**: el contador `cancellations` existe pero aún no se
incrementa en `cancelMatch` (TODO del sub-stage); por ahora solo penaliza no-show.
