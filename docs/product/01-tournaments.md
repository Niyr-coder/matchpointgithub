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

`CreateTournamentFlow.tsx` (modal 3-pasos):

```
Step 1 · T&C
  └── 8 cláusulas estrictas (responsabilidad civil, info veraz, refunds,
      antitrampas, reglas pickleball oficiales, datos personales, comisión
      MP, suspensión). Checkbox bloqueante.

Step 2 · Form
  ├── Deporte: pickleball (locked)
  ├── Modalidad: radio cards
  ├── Sistema scoring: 5 presets radio cards
  ├── Estructura cuadro: select
  ├── Inicio + fin (toggle "es de un solo día" → fin queda null)
  ├── Cupos (opc)
  ├── Cuota USD (con coherencia auto vs payment_policy)
  ├── Premio pool USD (opc — el granular va en PrizesPanel después)
  └── Método de pago: prepay/onsite/flexible/free

Step 3 · Preview
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

**Falta** (TODOs):
- `tournament_published` (al pasar de draft → registration_open)
- `tournament_finished` (al cerrar)
- `match_result_reported` (cuando reportan tu match)

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

**Bug histórico**: queries que selectban `player_id` (singular) explotaban
silenciosamente porque la columna no existe. Siempre `player_ids` y resolver
nombres vía join a `profiles`.

## 10. Premios

`tournament_prizes` es lista granular (1°, 2°, 3°, Mejor remontada, etc).
Cada premio puede tener valor monetario opcional + patrocinador opcional.
El `tournaments.prize_pool_cents` sigue siendo el total agregado (KPI
rápido).

UI: `PrizesPanel.tsx` con CRUD inline + quick-pick de puestos comunes.
Aparece en preview público y debería aparecer en `/eventos/[slug]` cuando
agregue ese render (TODO — hoy solo está en el preview modal del panel).

## 11. Bugs históricos / cosas que rompen seguido

1. **player_id vs player_ids** — siempre el array, nunca singular.
2. **getServerClient para UPDATE de tournaments/registrations** — la RLS
   no deja pasar al partner via anon. Usar admin client tras
   `requireTournamentEditor`.
3. **Notif duplicada al cancelar** — antes `cancelTournament` y
   `setTournamentStatus` ambas mutaban; ahora la primera delega en la
   segunda. NO volver a duplicar.
4. **`/eventos` cacheado mostrando torneos cancelados** — fixed con
   `force-dynamic`. NO sacar.
5. **MPR mostrado como "DUPR"** — el rename es completo, no volver a usar
   DUPR ni en copy ni en código.
6. **status hardcoded en pills sin cubrir todos los enums** — usar
   `txStatusMeta` para transactions y mapas exhaustivos para registrations.

## 12. TODOs

- [ ] Cronograma + premios visibles en `/eventos/[slug]` (hoy solo en preview interno)
- [ ] Notif `tournament_published` y `tournament_finished`
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
