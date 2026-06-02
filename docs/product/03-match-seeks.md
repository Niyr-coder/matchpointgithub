# Busco partido (match seeks / LFG)

Tablón asíncrono donde un jugador publica un aviso buscando rival; otros
jugadores de la misma ciudad lo ven en un feed y se postulan; el autor acepta a
uno y se crea un **match** (status `scheduled`) con su **chat** automático.

> Decisión de producto: arrancamos con **tablón asíncrono**, NO cola
> automática de matchmaking. La cola requiere densidad de jugadores
> simultáneos por ciudad que todavía no tenemos. El tablón funciona aunque
> haya pocos usuarios activos.

## Estado del feature

Detrás del feature flag **`match_seeks_enabled`** (`feature_flags`, mig 120),
**default `false`**. Mientras esté apagado, la sección del sidebar muestra un
estado honesto "Pronto" (`BuscoPartidoComingSoon`). Para activar:

- Global: subir `enabled_default` a `true` (o vía `AdminFlagsScreen`).
- Por usuario/rol/club: `feature_flag_assignments` (scope `user`/`role`/`club`).

## Modelo de datos (migs 117–120)

- `match_seeks` — el aviso (sport, mode, partner del autor si doubles, city
  snapshot, club opcional, rango skill_min/max, ventana, ranked, notes,
  status, match_id cuando se empareja, expires_at).
- `match_seek_applications` — postulaciones (applicant_id, partner_id si
  doubles, status pending/accepted/rejected/withdrawn, message).
- Status del seek: `open → matched | expired | cancelled`.

Ver `20-database.md §29.17`.

## Modalidades

- **Singles**: autor = teamA[1]; postulante aceptado = teamB[1].
- **Dobles (por duplas)**: el autor publica **con su partner**
  (`partner_id` obligatorio) → teamA = [autor, partner]. Los postulantes
  aplican **como dupla** (traen su `partner_id`) → teamB = [postulante,
  su partner]. Garantiza que el match resultante sea siempre 2v2 válido
  para el ELO. El caso "completar mi propio equipo con un random" queda
  **fuera de v1** (enturbia el rating).

## Ranked

El match se crea reusando `createMatch`, que marca `is_ranked` según el plan
del **creador del match** (= autor del seek = quien acepta). Si el autor es
free, el partido sale **no-ranked** aunque el aviso diga "ranked". La UI del
modal de publicar muestra esa salvedad cuando el autor es free.

## Flujo

1. `createMatchSeek` → aviso `open` en el feed de la ciudad del autor.
2. Otro jugador → `applyToMatchSeek` (notif `match_seek_applied` al autor).
3. Autor → `acceptApplicant`:
   - arma teamA/teamB, llama `createMatch` (status `scheduled`),
   - el trigger `fn_create_match_channel` (mig 118) crea la conversación
     `kind='match'` y suma a todos los jugadores,
   - cierra el seek (`matched` + `match_id`), acepta la postulación; los
     demás postulantes quedan **`pending`** (en pausa, no rechazados — ver
     `04-matches-lifecycle.md`: si el partido se cancela, el aviso se reabre
     y siguen disponibles),
   - notif `match_seek_accepted` al postulante (deep-link al chat vía
     `conversation_id`).
4. El partido sigue el ciclo normal de matches (`report → confirm`).

## Chat del partido (mig 118)

`conversations.kind` suma `'match'` + columna `match_id`. **Todos** los
matches abren chat al crearse (no solo los del tablón) — esto también arregla
el botón "Ir al chat del duelo" del `RetarModal`, que antes no abría nada.
La lista de chats (`MensajesScreen`) no filtra por kind (trae por membresía),
así que el chat del partido aparece sin cambios extra. `ConvoLite.kind`
incluye `'match'`.

## Server actions (`src/server/actions/match-seeks.ts`)

`createMatchSeek`, `cancelMatchSeek`, `listMatchSeeks` (feed por ciudad),
`listMyMatchSeeks`, `applyToMatchSeek`, `withdrawApplication`,
`acceptApplicant`. Todas gated por `match_seeks_enabled`
(`MATCH_SEEK.DISABLED` si está off).

## Notificaciones

- `match_seek_applied` → al autor. Link `/dashboard/user/busco-partido?focus=<seek_id>`.
- `match_seek_accepted` → al postulante. Link `/dashboard/user/chat?conv=<conversation_id>`.

Ver `guides/02-notifications.md §2`.

## Platform config

- `match_seek_expiry_days` (default 7) — vida del aviso.
- `match_seek_max_open_per_user` (default 5) — tope de avisos abiertos por jugador.

## UI

- Sección sidebar user (grupo Principal): `busco-partido`.
- Botón en Acciones rápidas del INICIO.
- `BuscoPartidoScreen` (server, gate por flag) + `BuscoPartidoScreenView`
  (client) con 3 pestañas:
  - **Cerca de ti** — feed por ciudad + filtros + postularse. El feed marca
    `myApplicationStatus` por aviso: si ya te postulaste el botón pasa a "Ya te
    postulaste" (no se puede duplicar).
  - **Mis avisos** — los que publicaste, con aceptar/cancelar postulantes y
    (si `matched`) cancelar/reprogramar el partido.
  - **Mis postulaciones** — las que enviaste, con estado (pendiente/aceptado/
    rechazado/retirado) y atajo al chat del partido si te aceptaron
    (`listMyApplications`).
- **Admin (Ola 3)**: sección `admin-matches` para soporte y gobernanza. Muestra
  avisos recientes, permite cancelar avisos abiertos y cruza postulaciones,
  matches, no-shows y fiabilidad en una sola pantalla.

## Cosas que rompen seguido

- **Deep-link al chat**: usar `conversation_id` con `?conv=`, NO `match_id`.
  El match_id ≠ conversation_id y `MensajesScreen` resuelve la conversación
  activa por `?conv=`.
- **Dobles sin partner**: tanto el seek como la postulación validan
  `partner_id` obligatorio en `mode=doubles` (Zod + check constraint + action).
- **Feature flag**: si lo activas pero el feed sale vacío, revisa que el
  perfil del usuario tenga `city` seteada (el feed filtra por ciudad).

## Pendientes / fuera de v1

- Filtro "mi club" (requiere `home_club_id` en el perfil, que aún no existe).
- Caso "completar mi equipo con randoms" en dobles.
- Cola automática de matchmaking.
- Moderación avanzada de avisos abusivos con razones/categorías; el camino
  mínimo admin ya existe en `admin-matches`.
