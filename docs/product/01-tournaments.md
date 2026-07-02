# Torneos

> **Leer antes de tocar** cualquier código que toque la entidad `tournaments`
> o sus sub-tablas. Hay 3 superficies (landing público, dashboard usuario,
> panel partner/admin) que tienen que mantenerse en sync.

## 1. Modelo de datos

### `tournaments` (mig 020 + extensiones 064-076)
Columnas clave:
- `id`, `slug`, `name`
- `partner_id` (nullable — torneo organizado por partner externo)
- `club_id` (nullable — sede)
- `sport` enum (`pickleball | padel | tennis`)
- `format` enum estructura del cuadro (`single_elim | double_elim |
  round_robin | swiss | groups_to_knockout`)
- `modality` enum (`singles | doubles | mixed_doubles`) — **mig 070**
- `scoring_config` jsonb `{type, points, winBy, bestOf}` — **mig 070**
- `status` enum `mp_event_status` (`draft | published | registration_open |
  registration_closed | live | finished | cancelled`)
- `starts_at` not null
- `ends_at` **nullable** — torneo de 1 día — **mig 073**
- `max_participants`, `entry_fee_cents`, `prize_pool_cents`, `currency`
- `payment_policy` (`free | prepay | onsite | flexible`)
- `is_featured` boolean — torneo estelar — **mig 066**

### Sub-tablas
| Tabla | Mig | Qué |
|---|---|---|
| `tournament_categories` | 020 + 075/076 | nombre, género, MPR min/max, edad min/max, cupos |
| `tournament_schedule_blocks` | 074 | cronograma editable (datetime + label + cat opc + notas) |
| `tournament_prizes` | 077 | lista de premios personalizados (puesto, label, valor opc, patrocinador opc) |
| `registrations` | 020 | inscripciones (player_ids[], status, paid_transaction_id) |
| `brackets`, `bracket_matches` | 020 | cuadro generado |

## 2. Modalidades y scoring (pickleball)

### Modalidades
- **Singles** (1 vs 1)
- **Dobles** (2 vs 2) — la más jugada
- **Mixed dobles** (1 hombre + 1 mujer por lado)

### Sistemas de scoring (presets oficiales)
Definidos en `src/components/dashboard/partner/CreateTournamentFlow.tsx`,
constante `SCORING_PRESETS`:

| id | label | type | points | bestOf | Cuándo usarse |
|---|---|---|---|---|---|
| `trad_11_bo3` | Tradicional · BO3 a 11 | side_out | 11 | 3 | Clásico de torneo |
| `rally_15_bo3` | Rally · BO3 a 15 | rally | 15 | 3 | PPA Tour moderno |
| `rally_21_single` | Rally · 1 game a 21 | rally | 21 | 1 | MLP regular season, formato corto |
| `trad_11_bo5` | Tradicional · BO5 a 11 | side_out | 11 | 5 | Finales pro |
| `popcorn` | Popcorn · rotación parejas | rally | 15 | 1 | Social mixers, leagues |

**Side-out**: solo el sacador puntúa. **Rally**: cualquiera puntúa cada
rally. **WinBy**: 2 siempre.

## 3. MPR (MATCHPOINT Rating)

Escala **2.0 - 8.0** propia de la plataforma. Cada categoría tiene rango
opcional `mpr_min/mpr_max`:
- ambos null → categoría "Open" (sin filtro de nivel)
- max null → `5.5+` (sin tope superior)
- ambos definidos → rango `3.0-4.0`

UI: dual-thumb slider en `CategoriesPanel.tsx` (step 0.25). Constraint DB
asegura que `min <= max` y rango 2-8.

**Importante**: NUNCA usar el término "DUPR" en UI/copy/comentarios — es el
naming externo que reemplazamos. Memoria del user: `user_voseo_no.md` + el
renombre se hizo en mig 076.

## 4. Flujo de creación

`CreateTournamentFlow.tsx` (modal 5-pasos: `terms → details → logistics →
categories → preview`):

```
Step 1 · Terms
  └── 8 cláusulas estrictas (responsabilidad civil, info veraz, refunds,
      antitrampas, reglas pickleball oficiales, datos personales, comisión
      MP, suspensión). Checkbox bloqueante.

Step 2 · Details
  ├── Nombre, descripción (opc), sede (club — opc, "sin sede · multi-club")
  ├── Deporte: pickleball (locked)
  ├── Sistema de puntuación (ScoringConfigurator):
  │     ├── 4 chips de preset rápido (Clásico BO3·11, Rally PPA BO3·15,
  │     │   MLP BO1·21, Finales BO5·11) — el chip que coincide con la
  │     │   config actual queda resaltado
  │     ├── "Personalizar puntuación ›" (colapsado por defecto) revela el
  │     │   editor crudo type/points/bestOf de "Partidos regulares" — la
  │     │   mayoría de torneos nunca necesita abrirlo
  │     └── Si formato = groups_to_knockout: checkboxes opcionales
  │         "Fase de grupos — puntuación diferente" y "Final — puntuación
  │         diferente", cada uno revela su propio editor crudo solo si se
  │         activa (mismo patrón de disclosure que el de arriba)
  ├── Estructura del cuadro: select (single_elim/double_elim/round_robin/
  │     swiss/groups_to_knockout)
  └── Si formato = groups_to_knockout: número de grupos + clasificados
        por grupo

Step 3 · Logistics
  ├── Inicio + fin (toggle "es de un solo día" → fin queda null)
  ├── Apertura/cierre de inscripciones (opc)
  ├── Cupos (opc)
  ├── Cuota USD (con coherencia auto vs payment_policy)
  ├── Premio pool USD (opc — el granular va en PrizesPanel después)
  └── Método de pago: prepay/onsite/flexible/free

Step 4 · Categories
  └── CategoriesPanel: nombre, género, rango MPR (slider), rango edad,
      cupo máximo por categoría. Si no se agrega ninguna, se crea una
      categoría default con la modalidad implícita del torneo.

Step 5 · Preview
  └── Card oscura estilo landing + KPIs + chips scoring

Submit → createTournament server action
  ├── Persiste con status='draft', termsAccepted=true requerido
  └── Redirige a /dashboard/partner/torneo/[id]
```

## 5. Estados y transiciones

```
draft ─────────────► registration_open ──┬─► registration_closed ──► live ──► finished
                          │              │                                       │
                          │              └────────────────────────────────────────┘
                          └─► cancelled ◄─── (cualquier estado, vía setTournamentStatus
                                              o cancelTournament)
```

**Reglas**:
- `draft` no aparece en listings públicos (`tournaments_public_summary` view
  filtra `draft` y `cancelled`).
- `cancelled` muestra banner rojo en todas las vistas y bloquea inscripciones.
- `finished` muestra banner negro y bloquea inscripciones.
- Solo `setTournamentStatus` y `cancelTournament` deben mover estados.
  `cancelTournament` (admin) delega en `setTournamentStatus` para reusar la
  notif `tournament_cancelled` (mig 097 — antes era un bug, no notificaba).

## 6. Notificaciones disparadas

Disparadas por server actions, persisten en `notification_jobs` →
dispatcher cron las renderiza en `notifications`. Catálogo:

| Kind | Cuándo | Recipient | Server action |
|---|---|---|---|
| `tournament_rescheduled` | Cambio de fechas (starts/ends) | jugadores pending+accepted | `updateTournamentByOrganizer` |
| `tournament_cancelled` | Status → cancelled | jugadores pending+accepted | `setTournamentStatus` / `cancelTournament` |
| `registration_accepted` | Partner/admin acepta inscripción | jugadores del registration | `updateRegistrationStatus` / `markTournamentRegistrationStatusAdmin` |
| `registration_rejected` | Partner/admin rechaza inscripción | jugadores del registration | `updateRegistrationStatus` / `markTournamentRegistrationStatusAdmin` |
| `tournament_registration_removed` | Admin remueve/cancela inscripción | jugadores del registration | `removeTournamentRegistrationAdmin` |
| `payment_proof_rejected` | Admin rechaza comprobante | customer de la tx | `rejectPaymentProofAdmin` |

**Implementados** (mig `20260605130000`):
- `tournament_published` ✅ (al pasar de draft → registration_open)
- `tournament_finished` ✅ (al cerrar / auto-finish desde monitor / reporte
  directo de la final — los tres paths llaman `notifyTournamentFinishedCore`
  en `src/lib/notifications/tournament.ts`)
- `match_result_reported` ✅ (cuando reportan tu match)
- `match_incident_reported` ✅ (incidente desde monitor de cancha · mig `20260630100000`;
  desde mig `20260711010000` también llega al owner/manager del club cuando el
  torneo no tiene partner — `notifyClubStaff` como fallback en `reportMatchIncident`)
- `tournament_match_ready` ✅ "Te toca jugar" (mig `20260710010000`): se
  encola cuando el partido de un jugador queda con ambos lados definidos —
  llave generada (ronda 1 sin byes), avance de ganador que completa el
  siguiente cruce, bronce completado, y sorteo de grupos (una notif por
  jugador, no por partido). Killswitch: flag `tournament_match_ready_notifs`
  (default ON). Render vía payload title/body (patrón mig `20260630100000`);
  href client-side en `NotificationsPanel.hrefForKind` →
  `/dashboard/[role]/torneo/[id]`. Helper: `notifyMatchReady` /
  `notifyGroupsDrawn` en `src/lib/notifications/tournament.ts`.
- `registration_waitlisted` / `waitlist_promoted` ✅ (mig `20260713000000`):
  lista de espera opt-in por torneo (`tournaments.allow_waitlist`, toggle en
  el wizard Step 3). Semántica: waitlist NO consume cupo (los counts usan
  pending+accepted) y NO genera transacción de pago; `registerToTournament`
  encola con `status='waitlist'` cuando torneo/categoría están llenos.
  Promoción FIFO (`promoteFromWaitlist` en `src/lib/tournaments/waitlist.ts`,
  misma categoría, revalida cupos, solo en fase de inscripciones) desde:
  `cancelMyRegistration`, `updateRegistrationStatus→rejected/withdrawn/waitlist`,
  `removeTournamentRegistrationAdmin`, `markTournamentRegistrationStatusAdmin→rejected`
  y `markTransactionRefundedCore`. El promovido pasa a `pending` y coordina
  el pago con el organizador (sin deadline automático en esta fase).

## 7. Sincronía cross-superficie

Cuando muto un torneo, los cambios tienen que verse en:

### Landing público
- `/eventos` listing — `force-dynamic` (mig en `src/app/eventos/page.tsx`)
  + `tournaments_public_summary` view excluye draft/cancelled
- `/eventos/[slug]` detalle — `force-dynamic` + banner rojo si cancelled

### Dashboard usuario
- `/dashboard/user` widget "Mis torneos" — `useRealtimeRefresh` en
  `UserHomeView.tsx` escucha `tournaments` + `registrations`. Render con
  pill CANCELADO + opacidad si `status === 'cancelled'`. Mig de UI: el
  filtro NO descarta cancelled aunque sea futuro (queremos que el user vea).
- `/dashboard/eventos/[slug]` — `getTournament` no filtra status; UI muestra
  banner si cerrado.

### Panel partner
- `/dashboard/partner/p-torneos` — listado con realtime
- `/dashboard/partner/torneo/[id]` — gestión completa
  - `<TournamentGestionRealtime>` suscribe a `tournaments`,
    `tournament_categories`, `tournament_schedule_blocks`,
    `tournament_prizes`, `registrations` (filtrados por id)
  - Panel `PartnerTorneoActions` se oculta si torneo cerrado
  - `MarkPaidInline` no aparece si `status === 'cancelled'`

### Panel admin
- `/dashboard/admin/admin-events` abre el detalle admin del torneo con
  inscripciones, transacciones, audit log y, desde Ola 2, una sección read-only
  de `brackets` + `bracket_matches` para soporte/scoring.

### Panel club
- `getClubSocial` en `clubs.ts` filtra:
  - `partner_id IS NULL` (solo torneos del club mismo, no de partner externo
    que use sus canchas)
  - `status NOT IN ('cancelled', 'draft')`

**Patrón** al agregar feature nueva al torneo: pensar en estas 4
superficies. Si solo lo veo en el panel partner pero no se refleja al user
inscrito, falta wiring de realtime o de fetch.

## 8. Permisos por rol

| Acción | User | Partner | Owner (club) | Admin |
|---|---|---|---|---|
| Ver listado público | ✅ | ✅ | ✅ | ✅ |
| Crear torneo | ❌ | ✅ (su partner_org) | ✅ (su club, `partner_id=null`) | ✅ (cualquier) |
| Editar (`updateTournamentByOrganizer`) | ❌ | ✅ (de su org) | ✅ (sin partner) | ✅ |
| Cambiar status | ❌ | ✅ | ✅ | ✅ |
| Cancelar (`cancelTournament` directo) | ❌ | ❌ | ❌ | ✅ |
| Marcar estelar | ❌ | ❌ ($20, paga manual) | ❌ | ✅ |
| Inscribirse | ✅ | ✅ | ✅ | ✅ |
| Generar bracket | ❌ | ✅ | ✅ | ✅ |
| CRUD categorías/cronograma/premios | ❌ | ✅ | ✅ | ✅ |
| Añadir inscrito manualmente | ❌ | ✅ (su torneo) | ✅ (su club) | ✅ |

El helper `requireTournamentEditor(tournamentId)` en `tournaments.ts`
encapsula la chequera (admin global o partner_member owner/admin del
`partner_id` del torneo).

## 9. Inscripciones

`registrations` shape (no `player_id` singular, ojo):
- `player_ids text[]` — array de UUIDs (1 para singles, 2 para dobles)
- `team_id` opcional (dobles puede ser team registrado o ad-hoc)
- `status` — `pending | accepted | rejected | waitlist` (`withdrawn` para cancelaciones)
- `paid_transaction_id` — link a transactions

Las acciones admin de soporte (`admin-tournament-registrations.ts`) usan
admin client tras validar rol. Si el admin cambia a `accepted/rejected`, se
reusan `registration_accepted/rejected`; si remueve la inscripción, se encola
`tournament_registration_removed`. La transferencia de cupo de torneos no
existe todavía porque `player_ids[]` + `team_id` hacen ambiguo si se reemplaza
un jugador o el equipo completo.

**Inscripción manual por partner**: el partner puede añadir jugadores directamente desde el panel de gestión sin que el jugador lo haga desde la app. Dos modalidades:
- **Jugador registrado**: se busca por nombre/username, se linkea al perfil existente vía player_ids[].
- **Walk-in**: el partner escribe el nombre; se almacena en guest_names[] y player_ids queda vacío. No recibe notificaciones (sin cuenta).
La inscripción se crea con status='accepted' directamente. Si el torneo tiene cuota (entry_fee_cents > 0), se crea una transaction status='pending' method='cash' que el partner marca como pagada con "Marcar pagado" cuando el jugador entrega el dinero.

**Pegar lista (bulk walk-ins)**: `AddInscritoManualModal.tsx` tiene un
toggle "Uno por uno" / "Pegar lista". El modo lista es **solo walk-ins**
(no intenta matchear nombres pegados contra jugadores registrados — eso
sigue siendo el flujo de búsqueda uno-por-uno) y llama a
`addRegistrationsBulkByPartner` (`partner-tournament-registrations.ts`).
Parseo client-side: singles = un nombre por línea; doubles/mixed = un
equipo por línea, separando los 2 nombres con `/` (fallback `,`) — una
línea de dobles sin separador se marca como error en vez de emparejar
por posición (evita desincronizar parejas si hay una línea suelta). El
server valida `names.length` contra `tournaments.modality`, calcula el
cupo restante de la categoría UNA vez para todo el lote (si no alcanza
para todos, inserta hasta el límite y reporta el resto como
`skipped: CATEGORY_FULL`), inserta las registrations en un solo INSERT
multi-fila, y crea las transactions pendientes de cobro (si aplica) en
paralelo por ventanas de 10. Tope de 200 entries por lote.

**Bug histórico**: queries que selectban `player_id` (singular) explotaban
silenciosamente porque la columna no existe. Siempre `player_ids` y resolver
nombres vía join a `profiles`.

## 10. Premios

`tournament_prizes` es lista granular (1°, 2°, 3°, Mejor remontada, etc).
Cada premio puede tener valor monetario opcional + patrocinador opcional.
El `tournaments.prize_pool_cents` sigue siendo el total agregado (KPI
rápido).

UI: `PrizesPanel.tsx` con CRUD inline + quick-pick de puestos comunes.
Desde 2026-07-01 la página pública `/eventos/[slug]` renderiza la lista
REAL de `tournament_prizes` en el podio (lectura pública, fetch en la page
→ prop `prizes` de `EventDetailView`); si el organizador no cargó premios
granulares, cae al split teórico 50/30/20 del `prize_pool_cents`.

**Resumen post-torneo del jugador** (Fase C): cuando el torneo está
`finished` y el user participó, la vista del jugador muestra "Tu torneo:
XW · YL · MPR ±Δ (+ puesto de grupo si hay)". Fuente: suma de
`match_rating_applications` del user en los partidos del torneo (admin
client en `tournament-player-page.ts` — la tabla es admin-only por RLS,
se filtra al propio uid). Walkovers no cuentan (no generan filas).

## 11. Bugs históricos / cosas que rompen seguido

1. **player_id vs player_ids** — siempre el array, nunca singular.
2. **getServerClient para UPDATE de tournaments/registrations** — la RLS
   no deja pasar al partner via anon. Usar admin client tras
   `requireTournamentEditor`.
3. **Notif duplicada al cancelar** — antes `cancelTournament` y
   `setTournamentStatus` ambas mutaban; ahora la primera delega en la
   segunda. NO volver a duplicar.
4. **`/eventos` cacheado mostrando torneos cancelados** — desde 2026-07-01:
   `revalidate = 60` + `revalidatePath("/eventos")` en `setTournamentStatus`
   (publicar/cancelar/finalizar invalidan al instante). NO volver a
   `force-dynamic` (2 queries por visita anónima) ni quitar el
   `revalidatePath` (volvería el bug de cancelados visibles).
5. **MPR mostrado como "DUPR"** — el rename es completo, no volver a usar
   DUPR ni en copy ni en código.
6. **status hardcoded en pills sin cubrir todos los enums** — usar
   `txStatusMeta` para transactions y mapas exhaustivos para registrations.
7. **guest_names en label derivation**: al mostrar la label de una registration, verificar guest_names[] ANTES de resolver por player_ids. Si guest_names.length > 0 y player_ids está vacío, es un walk-in — usar guest_names.join(' + ') como label.
8. **Conteo canónico de inscritos = `in ('pending','accepted')`, POR EQUIPO**
   (audit 2026-07-01, `src/lib/tournaments/registration-status.ts`). NUNCA
   `.not("status","in","(withdrawn,rejected,cancelled)")` — 'cancelled' ni
   existe en el enum y ese filtro incluye waitlist y cualquier status futuro
   (así nació el doble conteo de cancelar+re-inscribirse). La waitlist se
   muestra APARTE ("+N en espera"), nunca sumada. Y no mezclar unidades: el
   cupo es por equipo (registration), las listas de inscritos son por jugador
   — si comparas contra `max_participants`, usa el conteo por equipo
   (`InscritosList.registeredCount`).
9. **Re-inscripción tras soft-cancel**: clases y eventos tienen
   `unique(recurso, user)` + cancel suave → el alta debe REVIVIR la fila
   'cancelled' (update), no insertar — si no, "already enrolled" eterno.
   Torneos no lo sufren (permiten N filas históricas + trigger 067 dedup por
   status activo).
10. **Cupo atómico** (mig `20260716000000`): `tg_enforce_registration_caps`
   serializa las altas por torneo (`FOR UPDATE` sobre tournaments) y revalida
   max_participants/max_teams a nivel DB — los checks de la app son
   count-then-insert y bajo concurrencia se colaban. La app da los errores
   amigables; el trigger es la red. No quitarlo "porque la app ya valida".
11. **Seeding de `generateBracket` es por rating MPR** (desde 2026-07-01):
   promedio de `player_stats.current_rating` del equipo (sport + mode según
   modality, default 2500) + `standardBracketPairings` (1 vs último; byes
   caen en seeds altos). Ya NO es Fisher-Yates aleatorio.
12. **Check-in del día** (mig `20260716000000`): `registrations.checked_in_at`
   — el organizador marca presentes desde la lista de inscritos de gestión
   (`setRegistrationCheckIn`, contador "X/Y presentes"). Resolver no-shows
   (retirar/rechazar) ANTES de generar el cuadro para no sembrar ausentes.

## 12. TODOs

- [ ] Cronograma + premios visibles en `/eventos/[slug]` (hoy solo en preview interno)
- [x] Notif `tournament_published` y `tournament_finished` — implementadas · `20260605130000`
- [ ] Bracket editor visual (hoy solo `generateBracket` random + render)
- [ ] Match reporting (reportar resultados de cada partido del cuadro)
- [ ] Estelar pago con flujo de transacción (hoy solo admin lo marca tras cobro manual)
- [ ] Filtrar torneos cancelados del widget user "Mis torneos" tras N días
- [ ] Transferir torneo entre partner_orgs (admin override)

## 13. Grupos + eliminación (`groups_to_knockout`) — spec acordada

> **Estado:** implementación v1 (T0–T4). Aplicar migración `20260603180000_tournament_group_stage.sql` y regenerar types.

### 13.1 Decisiones de producto (2026)

| # | Tema | Decisión |
|---|---|---|
| 1 | Unidad de juego | **`registration_id`** (inscripción aceptada). Singles = 1 jugador en `player_ids[]`; dobles/mixto = la pareja/equipo entera. Grupos y llave nunca referencian `profiles` sueltos. |
| 2 | Armar grupos | **Sorteo aleatorio** (Fisher–Yates) repartido **equitativo** entre N grupos. Sin seed MPR en v1. |
| 3 | Clasificación | **Top N de cada grupo** (`advancePerGroup`), configurado por el organizador según el tamaño del grupo. Ej.: grupo de 8 → pasan los **4 mejores** (`advancePerGroup: 4`). No es “solo el 1.º”; es cuántos primeros puestos de la tabla del grupo clasifican. |
| 4 | Cruces en llave | **Estándar internacional:** evitar rematch del mismo grupo antes de la final; seeding desde rendimiento en fase grupos. |
| 5 | Scoring | Mismo `scoring_config` en fase grupos y eliminatoria **salvo la final**, que puede usar `final_scoring_config` opcional (ej. BO5). |
| 6 | Estado | **Fase por categoría** (no solo `tournaments.status` global). Ver §13.4. |

### 13.2 Modelo de datos (nuevo, torneos)

Fase grupos (round robin por grupo):

- `tournament_groups` — `category_id`, `name` (A/B/C…), `sort_order`
- `tournament_group_members` — `group_id`, `registration_id` (unique por categoría)
- `tournament_group_matches` — partido RR dentro del grupo: `round_no`, lados =
  `registration_id`, `score` jsonb (sets), `winner_side`, `status`, `court_id?`

Eliminatoria (existente, sin mezclar con grupos):

- `brackets` + `bracket_matches` — solo fase knockout; `format = single_elim`
  en la fila del bracket generado post-grupos.

Config por categoría (`tournament_categories.group_playoff_config` jsonb propuesto):

```json
{
  "groupsCount": 2,
  "advancePerGroup": 4,
  "finalScoringOverride": { "type": "side_out", "points": 11, "winBy": 2, "bestOf": 5 }
}
```

`advancePerGroup` = cuántos equipos **de cada grupo** pasan a eliminatoria (los
N primeros de la tabla de ese grupo). Debe ser `< tamaño del grupo` y el total
`groupsCount × advancePerGroup` debe dar un cuadro razonable (idealmente 4, 8 o 16).

Si `finalScoringOverride` es null → usa `tournaments.scoring_config`.

### 13.3 Fase de grupos — reglas

**Sorteo:** con G grupos y R inscripciones aceptadas, repartir `floor(R/G)` o
`ceil(R/G)` (diferencia máx 1 por grupo). Grupos con nombres A, B, C…

**Calendario RR:** dentro de cada grupo, generar fechas balanceadas (round-robin
 clásico: con 4 equipos → 3 fechas). Persistir en `tournament_group_matches`.

**Tabla por grupo** (derivada, append-only de partidos `played`):

1. Puntos / partidos ganados  
2. Diferencia de sets o games (según `scoring_config`)  
3. Head-to-head entre empatados  
4. Sorteo (solo si persiste empate — raro)

**Clasificados:** los **N mejores de cada grupo**, donde `N = advancePerGroup`
(lo define el organizador al crear la categoría). Ejemplos:

| Grupos | Equipos/grupo | `advancePerGroup` | Clasificados totales | Llave |
|---|---|---|---|---|
| 2 | 8 | 4 | 8 | Cuartos + semis + final |
| 4 | 4 | 2 | 8 | Cuartos + semis + final |
| 4 | 4 | 1 | 4 | Semis + final |
| 1 | 8 | 4 | 4 | Semis + final |

La UI valida que `advancePerGroup` no supere el tamaño real del grupo tras el
sorteo (grupos pueden diferir en ±1 equipo si R no divide exacto).

**Validación al cerrar grupos:**

- Mínimo 2 clasificados totales para generar llave.
- Si clasificados ∉ {2, 4, 8, 16}, rellenar **byes** al siguiente power-of-2
  favoreciendo a los mejores clasificados globales (mejor récord en fase grupos).
- Ej.: 3 grupos × top 2 = 6 equipos → cuadro de 8 con 2 byes.

### 13.4 Fase por categoría (`category_stage`)

Enum propuesto en `tournament_categories.stage`:

| Stage | Significado |
|---|---|
| `pending_groups` | Inscripciones listas; grupos no sorteados |
| `group_stage` | Jugando fechas de grupo |
| `group_complete` | Tablas cerradas; listo para generar llave |
| `knockout` | Eliminatoria en juego |
| `complete` | Campeón definido en esta categoría |

El `tournaments.status` global sigue siendo `live` / `finished`; la UI y las
actions usan `category.stage` para saber qué botones mostrar.

### 13.5 Seeding internacional → cuadro

Tras cerrar grupos:

1. **Rankear clasificados** globalmente (todos los que pasaron de cada grupo,
   ordenados por récord en fase grupos: victorias → diff sets → PF). Dentro del
   mismo puesto de grupo (1.º, 2.º…), desempatar con la tabla del grupo.
2. **Asignar seeds** 1…N.
3. **Bracket estándar** (potencia de 2, con byes arriba):  
   - Cuartos: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6 (plantilla clásica).  
   - Semis (4 equipos): **1 vs 4, 2 vs 3**.  
4. **Regla anti-rematch:** cuando pasan varios por grupo, emparejar **1A vs 2B**,
   **1B vs 2A**, **2A vs 1B**, etc. en primera ronda — cruces **entre** grupos,
   no dos del mismo grupo en cuartos/semis si se puede evitar.

La final usa `finalScoringOverride` si existe; el resto de rondas knockout usan
`scoring_config` del torneo.

### 13.6 Torneos tipo de referencia

**A — 16 parejas · 2 grupos de 8 · top 4 por grupo** (tu ejemplo)

| Fase | Qué pasa |
|---|---|
| Sorteo | 2 grupos × 8 inscripciones (aleatorio) |
| Grupos | RR dentro de cada grupo (7 fechas × 8 equipos) |
| Clasificados | 4 + 4 = **8** → cuartos + semis + final |
| Cuartos | Cruces internacionales 1A–2B, etc. |
| Final | BO5 si el organizador lo configuró; si no, BO3 a 11 |

**B — 16 parejas · 4 grupos de 4 · top 2 por grupo** (clásico FIFA)

| Fase | Qué pasa |
|---|---|
| Sorteo | 4 grupos × 4 inscripciones |
| Grupos | 3 fechas por grupo |
| Clasificados | 8 → cuartos + semis + final |

**C — 16 parejas · 4 grupos de 4 · top 1 por grupo** (más corto)

| Fase | Qué pasa |
|---|---|
| Clasificados | 4 → semis + final |

### 13.7 Flujo organizador (partner)

1. Cerrar inscripciones (`registration_closed`).  
2. Por categoría: **Sortear grupos** (aleatorio).  
3. **Generar calendario de grupos**.  
4. Reportar resultados RR (`reportGroupMatch`).  
5. **Cerrar fase de grupos** → congelar tablas + mostrar clasificados.  
6. **Generar cuadro final** (preview seeding → confirmar).  
7. Reportar eliminatoria (`reportBracketMatch` + avance automático).  
8. **Finalizar categoría** → podio + notif + (futuro) MPR.

### 13.8 Qué NO es esto (quedadas)

- Quedadas **Todos contra todos** = social, `quedada_games`, puntos a X, sin
  `registrations` ni BO3.  
- Playoffs opcionales en quedadas = producto aparte; **no reutiliza** estas tablas.  
- Misma *idea* (RR → llave), distinto dominio y scoring.

### 13.9 Roadmap implementación (torneos)

| Ola | Entregable |
|---|---|
| T0 | Wizard: deshabilitar formatos sin motor; link a este §13 |
| T1 | Schema §13.2 + sorteo aleatorio + RR + tablas |
| T2 | `reportGroupMatch` + cierre grupos + clasificados |
| T3 | `generateKnockoutFromGroups` + seeding §13.5 + byes |
| T4 | `reportBracketMatch` + avance + final con scoring override |
| T5 | UI árbol + fechas + realtime + notifs |

**Cosas que rompen seguido:** reutilizar `generateBracket` random para
`groups_to_knockout`; mezclar partidos de grupo en `quedada_games`; olvidar
`player_ids[]` (nunca `player_id` singular); olvidar sync en landing + user +
partner + admin (§7).

## 14. Pantalla de venue / TV (`/t/[slug]/live`)

Link público read-only que el club abre en sus **pantallas/monitores** para
mostrar el torneo en vivo. **No** es vista responsive de móvil: está pensada
para pantalla grande horizontal, glanceable a distancia. **No** es feature
pagada (no confundir con `is_featured`/"estelar").

### 14.1 Acceso y token

- URL: `/t/[slug]/live?k=<display_token>`. Sin login.
- `tournaments.display_token` (uuid) se genera/rota desde el panel partner
  (`TournamentVenueDisplayPanel`) vía `ensureTournamentDisplayToken` /
  `rotateTournamentDisplayToken`. Guard: `requireTournamentEditor` (admin o
  owner/admin del partner). Lectura pública valida `slug + token` con
  `getAdminClient` (RLS no aplica al ser service-role tras validar token).
- Bloqueada si el torneo está `draft` o `cancelled`. Página marcada
  `robots: noindex`.

### 14.2 Qué muestra

`getTournamentLiveDisplay` arma, desde group + bracket matches:

| Dato | Detalle |
|---|---|
| **Tablero por cancha** | Vista principal: por cancha, partido **actual** (`live`) con score por set + **siguiente** (`scheduled`, por `scheduled_at`). |
| **En juego / Resultados** | Cards con scoreboard (games por set + sets ganados). |
| **Próximos** | `scheduled` ordenados por hora, con cancha. |
| **Tablas de grupo** | Standings (`confirmed`), líneas neutras (sin barras verdes). |
| **Campeón** | Cuando la final está `reported`/`confirmed`. |
| **QR** | A `/eventos/[slug]` para que el público siga el torneo. |

El cliente (`TournamentLiveDisplayClient`) intercala el tablero por cancha
entre cada slide secundaria y rota cada 15 s. Realtime: escucha
`tournament_group_matches`, `bracket_matches`, `tournament_categories`,
`tournaments` (filter por id) + refetch cada 12 s + indicador "actualizado
hace X / reconectando".

**Cosas que rompen seguido:** olvidar que standings solo cuentan `confirmed`
(reportados se ven en el marcador pero no mueven tabla); identidad visual sigue
el Design System MATCHPOINT — emerald como único color de marca (en superficie
oscura, emerald-400 `#34d399`), negro + near-whites, Plus Jakarta 900 uppercase.
No introducir un segundo hue.

## 15. Monitores de cancha

Sistema que permite asignar usuarios de MATCHPOINT como monitores de cancha
durante un torneo. El monitor lleva el marcador desde su teléfono en
`/t/[slug]/monitor` y el partner ve el estado en vivo desde el panel de
gestión.

**Feature flag:** `tournament_monitors_enabled` (default `false`). Todo el
sistema está invisible si la flag está apagada. Activar desde `AdminFlagsScreen`.

### 15.1 Tablas

| Tabla | Migración | Qué guarda |
|---|---|---|
| `tournament_court_monitors` | `20260626210000` | Asignación monitor↔cancha por torneo. `is_active=false` = removido (soft delete). Constraint: una cancha activa = un monitor. Un monitor puede tener máx 2 canchas por torneo. |
| `match_incidents` | `20260706000000` | Incidentes reportados por el monitor durante un partido. `match_type` discrimina si es `bracket` o `group`. Audit trigger `tg_audit_match_incidents`. |

Ambas tablas están en la publication de realtime.

### 15.2 Flujo completo

```
1. Partner abre tab Operación → TournamentMonitorsPanel
2. Partner busca usuario por username → assignCourtMonitor()
   • Valida: cancha sin monitor activo, usuario existe, max 2 canchas/monitor
   • setAuditActor(partner) → INSERT tournament_court_monitors
3. Partner copia el link /t/[slug]/monitor y lo envía al monitor
4. Monitor abre el link → getMonitorContext() verifica asignación activa
   • Si no autenticado → redirect /login?next=/t/[slug]/monitor
   • Si no tiene cancha asignada → error "Sin cancha asignada"
5. Monitor ve pantalla de check-in con los dos equipos del partido actual
   • Confirma presencia de ambos lados
   • Selecciona quién saca primero
6. Monitor pulsa "Iniciar partido" → startMatch()
   • match.status = 'live', score = {sets:[], serving:'a'|'b'}
   • Si torneo en registration_open/closed → auto-pasa a 'live' (auto-live)
7. Monitor toca la mitad de pantalla del equipo que anota → addPoint() en cliente
   • Cada punto se persiste: localStorage inmediato + updateMatchScore() con
     debounce de 2s escribe score.current = {a,b} (puntos del set en curso)
   • Al completar un set → updateMatchScore() persiste sets completados +
     serving y resetea score.current
   • Partner ve sets Y puntos en vivo en TournamentCourtsLive en tiempo real
   • Recargar el teléfono NO pierde el marcador: getMonitorContext restaura
     sets + score.current del server y el history de undo desde localStorage
8. Monitor pulsa "Terminar" (habilitado cuando hay ganador) → pantalla Cierre
9. Monitor pulsa "Confirmar y enviar al organizador" → submitMatchResult()
   • match.status = 'reported', winner_side, score, duration_ms
   • TournamentCourtsLive muestra badge "Por confirmar" + botón Confirmar
10. Partner pulsa "Confirmar resultado":
    • Grupo → confirmGroupMatch() → status='confirmed', standings se actualizan
    • Bracket → confirmBracketMatch() → status='confirmed', ganador avanza al
      siguiente slot, ELO trigger automático en DB
    • Si es la final de todas las categorías → torneo pasa a 'finished'
      + notif tournament_finished a todos los inscritos
11. Monitor pulsa "Siguiente partido →" → getNextMatchForCourt()
    • Busca el primer partido scheduled en su cancha (bracket primero, luego grupo)
    • Si no hay más → mensaje "Espera al organizador"
```

### 15.3 Incidentes

El monitor puede reportar incidentes en cualquier momento durante el partido
(botón en el bottom sheet "···" de la fase live):

- **Conducta** (`behavior`) — conducta inapropiada
- **Equipamiento** (`equipment`) — problema de red, pelota, cancha
- **Clima** (`weather`) — condiciones que interrumpen el juego
- **Otro** (`other`) — campo libre

Cada incidente: INSERT en `match_incidents` con `court_id`, `match_id`,
`match_type`, `type`, `notes?`, `reported_by`. Dispara `notifyPartnerOrgStaff`
con kind `match_incident_reported` (mig `20260630100000`) → el partner recibe
notif push. El partner ve el feed en `TournamentIncidentsFeed` con refresh
realtime en `match_incidents`.

### 15.4 Componentes partner (tab Operación)

| Componente | Qué hace | Realtime |
|---|---|---|
| `TournamentCourtsLive` | Grid de canchas con estado (Programado / En vivo / Por confirmar) + sets completados + botón Confirmar | `bracket_matches`, `tournament_group_matches`, `tournament_court_monitors` |
| `TournamentIncidentsFeed` | Feed de incidentes ordenado por recencia | `match_incidents` filtrado por `tournament_id` |
| `TournamentMonitorsPanel` | Lista de monitores asignados + formulario de asignación + link copiable | — (reload local) |

Los tres solo aparecen si `tournament_monitors_enabled` está activo. `TournamentCourtsLive` además requiere que el torneo tenga canchas configuradas (`clubCourts.length > 0`).

### 15.5 Server actions

| Action | Archivo | Quién la llama |
|---|---|---|
| `assignCourtMonitor` | `tournament-monitors.ts` | Partner |
| `removeCourtMonitor` | `tournament-monitors.ts` | Partner |
| `listCourtMonitors` | `tournament-monitors.ts` | Partner (TournamentMonitorsPanel) |
| `getMonitorContext` | `tournament-monitors.ts` | Monitor (server component de la ruta) |
| `startMatch` | `tournament-monitors.ts` | Monitor |
| `updateMatchScore` | `tournament-monitors.ts` | Monitor (al completar cada set) |
| `submitMatchResult` | `tournament-monitors.ts` | Monitor |
| `getNextMatchForCourt` | `tournament-monitors.ts` | Monitor (tras enviar resultado) |
| `confirmBracketMatch` | `tournament-monitors.ts` | Partner (TournamentCourtsLive) |
| `reportMatchIncident` | `tournament-monitors.ts` | Monitor |
| `listCourtsLiveStatus` | `tournament-operation.ts` | Partner (TournamentCourtsLive) |
| `listMatchIncidents` | `tournament-operation.ts` | Partner (TournamentIncidentsFeed) |

### 15.6 Cosas que rompen seguido

1. **ELO trigger en bracket**: `confirmBracketMatch` actualiza `winner_side` → el trigger `elo_tournament_matches` se dispara automáticamente. **No calcular ELO manualmente** en el server action — ya lo hace la DB.
2. **`!session` en monitor page**: usar siempre `!session.authenticated`. `getSession()` nunca retorna null.
3. **buildRegLabels y walk-ins**: verificar `guest_names` antes de `player_ids`. Walk-ins no tienen perfil en MATCHPOINT.
4. **Cancha sin monitor asignado**: `TournamentCourtsLive` solo muestra canchas con monitor activo (`is_active=true`). Si se remueve un monitor, la cancha desaparece del grid automáticamente vía realtime.
5. **Auto-live**: `startMatch` pasa el torneo a `live` si estaba en `registration_open/closed`. No bloquear ese behavior en guards de UI.
6. **Flag apagada ≠ error silencioso**: todas las actions valoran `requireMonitorsEnabled()` y retornan `403 MONITORS.DISABLED` — no explotan.
7. **Claim atómico de partidos** (mig lógica en `startMatch`): el UPDATE lleva `status='scheduled'` + `court_id IS NULL OR court_id = miCancha` como filtro; si afecta 0 filas retorna `409 MONITORS.MATCH_TAKEN` y el cliente carga el siguiente partido. Los fallbacks de `getMonitorContext`/`getNextMatchForCourt` solo devuelven partidos `scheduled` con `court_id` null, repartidos por offset determinístico de cancha. NO volver al patrón "primer partido del torneo para todos".
8. **`updateMatchScore`/`submitMatchResult` validan la cancha**: `requireMatchOnMyCourt` exige que el `court_id` del partido esté entre las canchas del monitor (`403 MONITORS.MATCH_NOT_YOURS`). `updateMatchScore` además solo acepta partidos `live`.
9. **`score.current` es transitorio**: `{sets, serving, current}` — `current` son los puntos del set en curso; `submitMatchResult` lo limpia al escribir el score final. Los consumidores de standings solo deben leer `sets` de partidos `confirmed` (sin cambio).
10. **Correcciones SÍ recalculan ELO** (mig `20260710000000`): si cambia `winner_side` de un partido ya aplicado, el trigger revierte los deltas efectivos (tabla `match_rating_applications`) y re-aplica. Partidos aplicados ANTES de esa mig no tienen filas de aplicación → no se revierten (comportamiento legacy preservado). Corrección de solo-score (mismo ganador) no toca el rating.

## 16. Liga (round-robin) — HABILITADO 2026-07-01

`round_robin` quedó habilitado en el wizard (2026-07-01). `swiss` sigue
"Próximamente" (falta el motor de emparejamiento — ver Fase 3 del plan).
`double_elim` sigue deshabilitado Y `generateBracket` lo rechaza
explícitamente (`BRACKETS.FORMAT_UNAVAILABLE`) — antes degradaba en silencio
a single_elim.

### 16.1 Arquitectura

Storage compartido con grupos: **un `tournament_group` "Liga" por categoría**
(`tournament_groups`/`_members`/`_matches`). Sin tabla propia. El trigger de
ELO de `tournament_group_matches` aplica igual (reportar = confirmar directo).

| Pieza | Dónde |
|---|---|
| Actions | `src/server/actions/tournament-liga.ts` — `getLigaData`, `generateRoundRobinSchedule`, `reportLigaMatch`, `correctLigaMatch`, `closeLigaStage` |
| Panel partner | `LigaOperacionPanel` (server) + `LigaOperacionPanelView` (client) — un panel POR categoría en el tab Operación |
| Motor RR | `buildRoundRobinRounds` (método del círculo, maneja bye impar) — compartido con grupos |
| Standings | `computeGroupStandings` — compartido |
| Vista jugador | infra de grupos (`player-matches.ts`), agnóstica de formato |

### 16.2 Flujo

```
1. Crear torneo formato round_robin (+ ≥1 categoría) → publicar → inscribir
2. Partner → tab Operación → "Sortear calendario" (por categoría)
   • generateRoundRobinSchedule: requiere ≥2 accepted; crea grupo Liga +
     members + partidos por fechas (round_no)
   • Notif tournament_match_ready por jugador ("Tu calendario de liga está listo")
3. Partner carga marcadores (ScoreMatchCard) → reportLigaMatch confirma
   directo → trigger ELO. correctLigaMatch revierte+reaplica (mig 20260710000000)
4. Todos confirmados → botón "Finalizar liga" → closeLigaStage:
   • valida 0 pendientes → category.stage='complete' → campeón = rank 1
   • si TODAS las categorías complete → torneo 'finished' + notif
     tournament_finished (mismo contrato que brackets)
   • post-cierre: marcadores read-only (LIGA.CLOSED en report/correct)
```

### 16.3 Cosas que rompen seguido

1. **`requireLigaEditor` delega en `requireTournamentEditor`** (fix 2026-07-01):
   la copia local anterior NO tenía el branch de club anfitrión — un torneo de
   club sin partner era inoperable salvo admin. No volver a duplicar el guard.
2. **Cierre por categoría, no por torneo**: `closeLigaStage` es per-categoría;
   el torneo solo pasa a `finished` cuando TODAS las categorías están
   `complete`. El botón "Finalizar torneo" (closeTournament) sigue siendo el
   override manual.
3. **Sin scheduling por cancha en esta fase**: los partidos de liga no llevan
   `scheduled_at`/`court_id` → los monitores de cancha NO cubren liga (el
   partner carga scores desde el panel). Documentado como limitación.
4. **Campeón** = rank 1 de `computeGroupStandings` (wins → dif sets → dif
   games → h2h). `getDerivedCategoryWinners` ya deriva liga (rank 1 del grupo
   único cuando no hay bracket).
