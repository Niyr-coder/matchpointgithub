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
