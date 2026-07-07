# Quedadas — motor de juego (por formato)

Las Quedadas son el juego social casual (distinto de torneos): un organizador
arma una junta, los jugadores se inscriben, se juega y se publican resultados.
La capa de organización (crear, categorías, parejas/inscritos, pagos, logística,
estados, cierre) vive en `20-database.md §29.21`. Este doc cubre el **motor de
juego** rediseñado (mig 141).

## Por qué se rehizo

El motor anterior forzaba **todos** los formatos a un molde único
`grupos → tabla → fase final de medallas (bracket)` con **parejas fijas**. Eso es
un torneo disfrazado y no calza con los formatos sociales reales (un americano
rota de compañero cada ronda). Se borró por completo (`drop table
quedada_matches`) y se reemplazó por un **motor por formato** sobre un modelo
**player-céntrico**.

## Modelo de datos

- `quedada_rounds` — una ronda de una categoría (`round_no`, `status`).
- `quedada_games` — un partido de la ronda con **lados a nivel jugador**
  (`side_a_p1`, `side_a_p2?`, `side_b_p1`, `side_b_p2?`, `points_a?`, `points_b?`,
  `court_no`, `status`). `p2` null = singles. Nunca referencia `quedada_pairs`
  (la pareja es efímera por ronda en los formatos de rotación).
- `target_points` en `quedada_categories` y `quedadas` — largo del partido a X
  puntos (fallback categoría → quedada → 24).

Los **standings son derivados** (append-only) de los games `played`; nunca se
guarda un estado mutable que haya que recomputar al cambiar el roster.

## Formatos

Todas las superficies usan el mismo modelo (`quedada_rounds` + `quedada_games`);
cada formato solo cambia su motor de emparejamiento, la unidad del roster y la
tabla.

| Formato | Estado | Mecánica |
|---|---|---|
| Rotación de parejas (`americano`) | ✅ Activo | Rotación individual: cambias compañero/rival cada ronda; ranking individual. |
| Todos contra todos | ✅ Activo | Parejas fijas, todos contra todos por rondas; tabla por pareja. |
| Escalera por nivel (`mexicano`) | ✅ Activo | Rondas por ranking actual: niveles cercanos se cruzan entre sí. |
| Rey de la cancha (KOTC) | ✅ Activo | Orden por canchas/nivel; los equipos se emparejan según rendimiento reciente. |
| Mezcla social (`canguil`) | ✅ Activo | Rotación social aleatoria cada ronda. |
| Personalizado (`libre`) | ✅ Activo | El organizador crea partidos manuales y carga resultados. |
| Modo Torneo (`torneo`) | ✅ Activo | Fase de grupos (round robin) → semifinales → final y bronce, como un torneo real. |

### Modo Torneo (`torneo`) — mig 20260723000000

- **Unidad:** parejas fijas en dobles, individual en singles (igual que
  `round_robin`). El **orden de cupos es el seeding**.
- **Estructura derivada** (sin tablas de bracket; todo sale de
  `quedada_rounds`/`quedada_games`): 1 grupo con <6 equipos, 2 grupos (por seed
  alternado) con ≥6. Rondas 1..K = fechas del round robin por grupo (método del
  círculo). Ronda K+1 = **Semifinales** (A1-B2 / B1-A2 con 2 grupos; 1°-4° /
  2°-3° con 1 grupo de ≥4; con 3 equipos no hay semis). Última ronda = **Final +
  bronce**. Mínimo 3 equipos.
- **Gates de progresión:** las semis solo se generan con TODA la fase de grupos
  jugada; la final solo con ambas semis decididas (un empate en el marcador
  bloquea — corrige el score). `planNextRound` devuelve null en esos casos.
- **Podio:** hook `podium` del engine (final y bronce mandan, no la tabla);
  `finishQuedada`/`finishQuedadaCategory` lo usan vía
  `writeCategoryPodiumRanks`.
- **Fases visibles:** hook `roundNameFor` → el panel muestra "Fase de grupos ·
  Fecha 2" / "Semifinales" / "Final y bronce" (vía `QuedadaGameView`).
- **Killswitch:** flag `quedada_format_torneo` (default ON, ausente = ON):
  apagado oculta la card del wizard y `createQuedada` rechaza el formato
  (`QUEDADAS.FORMAT_DISABLED`).
- **Roster bloqueado con games:** cambiar cupos re-armaría grupos/seeding, así
  que `assignPair`/`removePair`/`autoAssignCategory` rechazan con
  `QUEDADAS.TORNEO_ROSTER_LOCKED` si la categoría ya tiene partidos — borra las
  rondas primero.
- **Borrar rondas:** si borras una fecha intermedia de grupos, "Siguiente"
  regenera ESA fecha faltante (no la posterior al máximo); semis/final también
  se regeneran si se borran.

### Rotación de parejas (`americano`)

- **Unidad:** individual.
- **Puntuación:** puntos a favor acumulados; desempate por diferencia (PF−PC),
  luego victorias. `src/lib/quedadas/standings.ts`.
- **Emparejamiento:** algoritmo greedy ronda-a-ronda que minimiza repetir
  compañero y rival; **byes rotativos** (los reciben quienes menos descansaron,
  evitando back-to-back). Los byes se derivan (no hay tabla de byes).
  `src/lib/quedadas/americano.ts`.
- **Largo del partido:** a `target_points`.
- El organizador **reporta directo** el marcador (sin doble confirmación).
- **Roster individual:** en americano el roster se arma por **jugadores
  individuales** (1 por cupo de `quedada_pairs`, `player_b` null), no parejas
  fijas — el compañero rota cada ronda. `match_mode` (singles/dobles) solo define
  cuántos juegan por lado en cada game, no la estructura del roster. El motor
  (`planAmericanoRound`) aplana los cupos en una lista de jugadores. El panel usa
  `rosterModeFor(format, match_mode)` para decidir si la categoría se gestiona por
  **Jugadores** o por **Parejas**.

**Orden del flujo en gestión:** las pestañas son **Resumen → Pagos → Jugadores/
Parejas → Configurar** — la gente se inscribe y paga primero, y con los
confirmados se arma el roster.

## Server actions (`src/server/actions/quedadas.ts`)

- `generateQuedadaRound({ quedadaId, categoryId })` — busca el engine por
  `format` y arma la siguiente ronda/fecha/turno.
- `generateAmericanoRound` — alias temporal hacia la action genérica para no
  romper call sites internos.
- `createManualQuedadaGame({ quedadaId, categoryId, sideA, sideB, courtNo? })` —
  crea un partido manual para formato Libre.
- `reportGame({ gameId, pointsA, pointsB })` — reporta el marcador.
- `deleteRound({ roundId })` — borra una ronda (games caen por cascade) para
  regenerar.
- `finishQuedada({ quedadaId })` — calcula el podio por categoría según el engine
  (individual o pareja) y escribe `final_rank` a los 3 primeros; pasa la quedada
  a `finished`.
- `getQuedadaManageData` — organizador: devuelve `rounds` + `games` + `target`.
- `getQuedadaPlayerView` — **jugador (read-only)**: misma data del motor SIN
  invite_code/cohosts/payment_account (anti-leak).

## Superficies (sync cross-superficie)

`/dashboard/user/quedadas` muestra el índice del jugador con data real de
`QuedadasScreen`: hero compacto, filtros de descubrir (formato/cuándo/precio),
card destacada para una quedada abierta y agrupación tipo agenda en la pestaña
`Juego`. Las acciones siguen usando las mismas server actions (`joinQuedada`,
`leaveQuedada`, `cancelQuedada`, `deleteQuedada`, `reportQuedada`) y el CTA
`Tu calendario` entra directo al detalle con `?tab=calendario`.

La ruta `/dashboard/[role]/quedada/[id]` bifurca con `QuedadaPageRouter` (client,
lee `canManage`):

- **Organizador / co-host** → `QuedadaManagePanel` (gestión, con controles).
- **Jugador inscrito / quedada abierta** → `QuedadaDetailView` (pantalla
  read-only) con tabs `Tu calendario`, `Calendario general`, `Detalles` y
  `Tabla`. El CTA "Tu calendario" abre `/dashboard/user/quedada/[id]?tab=calendario`.

El organizador monta el componente compartido **`QuedadaGameView`** con controles
(generar ronda, crear partido manual, reportar, borrar ronda, cerrar). La vista
del jugador usa la misma data read-only de `getQuedadaPlayerView`, pero la
reorganiza player-first: próximo partido propio, schedule por ronda, calendario por
cancha y tabla derivada según el engine.

**Admin plataforma (mig/app Ola 2):** `/dashboard/admin/admin-quedadas` enlaza
cada fila a `/dashboard/admin/quedada/[id]`. `getQuedadaManageData` permite
`role=admin` global para abrir el panel de gestión y soporte puede cancelar la
quedada o remover participantes con `kickQuedadaParticipantAdmin`.

**Realtime:** `quedada_rounds` y `quedada_games` están en `supabase_realtime`. El
panel y el detalle del jugador refrescan en vivo (debounce 400ms) cuando el
organizador genera rondas o reporta marcadores.

**Pagos agrupados por pareja:** la pestaña Pagos del panel agrupa a los inscritos
por su pareja (categoría → slot) cuando hay parejas asignadas, con un indicador
"Completa" / "N/M" por pareja. El pago sigue siendo **por persona** (`paid` por
participante, cuota `fee_cents` por jugador) — la agrupación es solo
presentacional para ver de un vistazo qué pareja ya pagó. Inscritos sin pareja
caen a un grupo "Sin pareja asignada"; sin parejas, lista plana (comportamiento
anterior).

## Walk-ins (guests sin cuenta) — mig 20260722000000

El organizador (o co-host) agrega desde el tab **Jugadores** ("Agregar walk-in")
a quien llegó sin cuenta MatchPoint. El walk-in es una fila en `quedada_guests`
con UUID propio y **juega como cualquier inscrito**: se le asigna cupo
(manual o "Llenar al azar"), entra al motor de emparejamiento, a los games y a
los standings (los engines operan sobre IDs opacos). Aparece con badge
"Walk-in" en el roster, en Pagos (toggle pagado/check-in propio, sin "Avisar"
porque no recibe notifs) y en el modal de detalles. Cuenta para el cupo
efectivo. Quitar un walk-in libera sus cupos; si ya tiene partidos generados,
se bloquea (`QUEDADAS.WALKIN_LOCKED`) — borra o ajusta esas rondas primero.
Actions: `addQuedadaWalkIn` / `removeQuedadaWalkIn` / `setGuestPaid` /
`setGuestCheckedIn`.

- **`addQuedadaWalkIn` NO valida cupo a propósito**: el organizador es el dueño
  de su cupo y el walk-in llega el día del evento; puede sobrellenar si quiere.
  Los jugadores que intenten inscribirse después sí reciben `QUEDADAS.FULL`.
- **Podio con walk-ins (mig 20260723020000)**: `quedada_guests.final_rank`.
  `writeCategoryPodiumRanks` y `setQuedadaResults` escriben el puesto en
  participante O guest según a quién corresponda el id; `PodiumSection` y el
  tab Resultados lo leen de ambos.
- **Stats del organizador**: `getMyQuedadasFinanceStats` suma inscritos +
  walk-ins (mismo `fee_cents`), cuadrando con el hero de Pagos del panel.

## Pagos: check-in, aviso de pago y stats (mig 144–145)

El tab **Pagos** es el centro de operación del día. Tres capas además del flag
`paid` por persona:

- **Check-in de asistencia** (`quedada_participants.checked_in_at` + `checked_in_by`,
  mig 144). Es **meramente informativo**: NO bloquea el motor de emparejamiento ni
  el pago — alguien sin check-in puede jugar igual (queda como no pagado si no
  pagó), y el no-show se maneja con el flujo de reportes existente. Actions
  `setParticipantCheckedIn` / `setAllCheckedIn` (creador/co-host, vía RLS
  `qp_update`).
- **Aviso de pago** (`remindQuedadaPayment({quedadaId, userIds?})`): manda a los
  inscritos `joined` con `paid=false` una **notif inapp** (`quedada_payment_reminder`,
  mig 145) **+ DM del sistema** con los datos de transferencia. **Cooldown de
  30 min** por persona (`payment_reminded_at`); devuelve `{sent, skipped}`. Encola
  con admin client + `setAuditActor`.
- **Stats financieras del organizador** (`getMyQuedadasFinanceStats`, read-only
  scoped a `creator_id`): recaudado / esperado / pendiente / % cobrado / asistencia
  promedio agregado de TODAS sus quedadas. El recaudado es **estimado**
  (`paidCount × fee_cents`; pago offline, sin transacción).
- **Ficha por jugador** (`getQuedadaPlayerHistory({playerUserId})`): en MIS
  quedadas, cuántas veces participó, total pagado, % de pago y % de asistencia.

## Configuración: editar datos generales, motor y link (mig 146)

El tab **Configuración** (solo creador) edita lo que el wizard captura al crear:

- **Datos generales** (`updateQuedadaDetails`): título, descripción, **fecha**,
  sede, visibilidad, cupo, perks. **Formato y modo (singles/dobles) NO se
  editan** — cambiarlos rompe games/standings existentes. Si cambia `starts_at`
  → notif **`quedada_rescheduled`** a los inscritos `joined` (admin +
  `setAuditActor`, igual que torneos).
- **Motor de juego** (`updateQuedadaLogistics` +`engineMode`): toggle
  `rounds`/`rolling` + `target_points`. El toggle de motor está **bloqueado si
  ya hay games** (`QUEDADAS.ENGINE_LOCKED`); se muestra de solo lectura.
- **Link de invitación** (`regenerateInviteCode`): regenera el `invite_code`
  (invalida el `/q/[code]` anterior) vía RPC `gen_quedada_invite_code`.
- Se mantienen Categorías, Logística, Cobro (banco/premios/reglas) y Co-hosts.

**Borrar quedada** (`deleteQuedada`, creador): borrado **duro** (las hijas caen por
`on delete cascade`), restringido a `status='cancelled'` (`QUEDADAS.DELETE_BLOCKED`
si no) para limpiar la lista de "Organizo". UI: una **"x"** en la tarjeta cuando
está cancelada (solo el creador).

## Cosas que rompen seguido

- **No reusar `quedada_pairs` para los lados del game.** En americano la pareja
  cambia cada ronda; los lados van a nivel jugador en `quedada_games`.
- **Byes:** no existen como filas. Se derivan (inscritos de la categoría que no
  juegan esa ronda). No los penalices en standings.
- **Vista del jugador:** usar `getQuedadaPlayerView`, NO `getQuedadaManageData`
  (este último expone datos de gestión).
- **Formato y roster:** no hardcodear `format === "americano"` para decidir la UI.
  Usa `getQuedadaEngine`, `rosterModeFor` y `standingsModeFor`.

## Modal de detalles (preview desde la tarjeta)

`quedadas + rules jsonb` (mig 142): array de `{ text, warn }` ("Reglas clave"
editables por el organizador; `warn=true` → ⚠, `false` → ✓). Editor `RulesEditor`
en el wizard de crear y en Configurar del panel (vía `updateQuedadaLogistics`).

Action **`getQuedadaDetails`** (read para el modal): valida visibilidad con la
RLS de `quedadas` y devuelve quedada + reglas + premios + inscritos con su **MPR**
(`player_stats.current_rating`, máx por jugador) y **tag de team**
(`team_members → teams.slug`, el primero por `joined_at`). MPR/team se leen con
`getAdminClient` **post-validación** de visibilidad (data pública: ranking/teams),
solo lectura → sin audit. En quedada **privada** solo la ven miembros.

El modal `QuedadaDetailsModal` (preview rápido desde la tarjeta, sobre todo en
Descubrir) **convive** con la página `/quedada/[id]` (juego/gestión). Abre con
animación FLIP (WAAPI) que "crece" desde la tarjeta, vía portal a `document.body`;
el detalle se **prefetchea** al hover de la tarjeta para abrir sin loading. La
sección Inscritos tiene **tabs por categoría** (Todos + cada categoría, filtrando
por los jugadores asignados en `quedada_pairs`).

**Cupo efectivo:** cuando la quedada tiene categorías, el cupo MÁXIMO se deriva de
la **suma de `max_slots` de las categorías × jugadores por cupo** (1 en motores
individuales, 2 en parejas fijas), no del `max_players` global. Sin
categorías, se usa `max_players`. (`QuedadasScreen` lo calcula y lo pasa como
`maxPlayers` a la tarjeta y al modal, evitando la inconsistencia "24 inscritos /
cupo 16".)

## Inscripción (join) — pago offline + selección de categoría

- **El creador NO queda inscrito automáticamente.** `createQuedada` recibe
  `creatorPlays` (default `false`): solo se inserta en `quedada_participants`
  si el organizador activa "Juego también" en el paso 1 del wizard ("Tu rol").
  Si eligió "Solo organizo", puede inscribirse o salir después desde el menú
  "⋯" de su tarjeta ("Inscribirme como jugador" / "Salir como jugador"). El
  chat grupal no depende de esto: `fn_ensure_quedada_channel` agrega al
  creador como admin del canal aunque no sea participante.

- **Sin pantalla de pago.** `joinQuedada` (y `joinByInviteCode`) **no** crean
  `transactions` ni redirigen a `/pagos`. El pago es **offline** (transferencia /
  en el lugar); el organizador marca `quedada_participants.paid` a mano en la
  pestaña Pagos. La cuota (`fee_cents`) es informativa.
- **Selección de categoría.** `joinQuedada({ quedadaId, categoryId? })`: si la
  quedada tiene categorías, el jugador **elige una** (UI `JoinPickerModal`, lista
  con `taken/maxSlots`, deshabilita llenas) y se le asigna el **cupo libre más
  bajo** (`1..max_slots`) en `quedada_pairs` si el engine usa roster individual
  (`player_a` = user). Errores: `QUEDADAS.CATEGORY_REQUIRED`,
  `QUEDADAS.CATEGORY_FULL`. Sin categorías → inscripción directa.
- **RLS:** el insert del cupo va con **`getAdminClient` post-validación** (la RLS
  de `quedada_pairs` solo deja mutar a `can_manage`) + `setAuditActor(userId,"user")`.
- **`/q/[code]`:** inscribe sin pantalla de pago y sin selección de categoría (el
  organizador asigna luego).
- **Cupo en la lista:** la tarjeta y el modal muestran "Tu próxima" en tiempo
  relativo ("en 3 días", "en 8 horas", "en 30 minutos") y el cupo efectivo por
  categorías.

## Motor ROLLING / continuo por cancha (mig 143)

Alternativa al modelo por rondas para Americano: cada **cancha** es una ranura
persistente con un partido; al reportar el marcador (la cancha se libera) el motor
asigna **automáticamente** el siguiente emparejamiento en esa cancha. No hay
"ronda global".

- **Switch por quedada:** `quedadas.engine_mode` (`'rounds'` default | `'rolling'`).
  Convive con el modo por rondas; rolling es opt-in (no rompe quedadas existentes).
- **Schema (mig 143):** `quedada_games.round_id` y `round_no` pasan a **nullable**
  (en rolling los games no pertenecen a una ronda); se agrega
  `court_match_no` = contador de partido **por cancha** ("Cancha 3 · Partido 5",
  referencia para que el organizador llame jugadores sin confundirse).
- **Asignación (`pickNextCourtMatch` en `americano.ts`):** al liberar una cancha
  toma jugadores del **pool libre** (no ocupados en otras canchas), priorizando a
  quienes más descansaron y minimizando repetir compañero/rival. **Política sin
  banca:** si los únicos libres son los que recién jugaron y otras canchas siguen,
  la cancha **espera** (no se reasigna); si todas están libres, arma con lo que haya.
- **Estado actual:** está pausado. `startAmericanoRolling` corta con
  `QUEDADAS.ROLLING_WIP` y la UI fuerza `rounds` hasta completar la vista por
  cancha/cronológica para organizador y jugador.

## Pendientes

- Tablas de rotación fijas para cuentas "bonitas", notif
  `quedada_round_published`, `target_points` en `platform_config`.
