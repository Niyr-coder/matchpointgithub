# Handoff maestro · MATCHPOINT → Claude Code

> **Propósito:** evitar rehacer trabajo ya commiteado en `main`.
> **Estado repo:** `main` @ `90c78b9` (sync con `origin/main`, junio 2026).
> **Transcript Cursor:** `agent-transcripts/13518134-194d-447f-82c8-f02d4885b94b.jsonl`

---

## Prompt inicial (pegar en Claude Code)

```
Proyecto: MATCHPOINT (Next.js 16 + Supabase), repo matchpointgithub.
Branch: main @ 90c78b9 — TODO lo listado abajo YA ESTÁ HECHO; no reimplementes.

OBLIGATORIO antes de codear:
1. AGENTS.md + docs/README.md (español ecuatoriano neutro, tuteo, marca MATCHPOINT)
2. docs/handoffs/CLAUDE-CODE-MASTER.md (este archivo)
3. Doc de dominio: docs/product/01-tournaments.md si tocas torneos

Reglas duras:
- Leer docs antes de schema/RLS/realtime/torneos/pagos/premium
- Diff mínimo; no "mejorar" cosas que ya funcionan
- No commitear supabase/.temp/
- Invocar skills del proyecto cuando aplique (docs-guide, feature-plan, ui-review)

Si el user pide "continuar torneos grupos": lee § Torneos grupos abajo.
Si pide otra cosa: busca en § Inventario por dominio antes de proponer plan desde cero.
```

---

## Inventario por dominio — NO REHACER

### Torneos · base (pre-grupos)

| Hecho | Dónde / commit |
|-------|----------------|
| Wizard creación ampliado (modalidades, scoring presets, T&C) | `CreateTournamentFlow.tsx` · `2033257` |
| Brackets estilo Apple Sports | `PartnerBracketsScreenView`, `BracketView` · `2033257` |
| Torneos de club + asignación partner | `743348` |
| Categorías por torneo (MPR, género, edad, cupos) | `CategoriesPanel`, mig 075/076 |
| Cronograma (`tournament_schedule_blocks`) | `SchedulePanel` |
| Premios por categoría | `PrizesPanel` |
| Gestión partner `/dashboard/partner/torneo/[id]` | page + actions + realtime |
| Vista jugador `/dashboard/[role]/torneo/[id]` | `TorneoPageRouter`, `TorneoDetailView` |
| Inscripciones multi-categoría | `TournamentDetailView`, eligibility |
| Fix RLS crear torneo desde club/manager | sesión transcript ~10131 |
| Setup lock tras bracket / stages | `lib/tournaments/setup-lock.ts` |

### Torneos · fase de grupos (`groups_to_knockout`) — núcleo

| Hecho | Detalle |
|-------|---------|
| **Migración DB** | `supabase/migrations/20260603180000_tournament_group_stage.sql` — tablas `tournament_groups`, `_members`, `_matches`; realtime publication |
| **Motor** | `src/lib/tournaments/group-stage.ts` — standings, qualifiers, wildcards, cross-group pairings, validation, preview |
| **Server actions** | `src/server/actions/tournament-group-stage.ts` — draw, schedule, report, **confirm**, correct, close, generateKnockout, bracket scoring |
| **Config UI** | `CategoryGroupConfigPanel.tsx` — grupos, advancePerGroup, mejores terceros, bronce, BO5 final, preview byes |
| **Operación UI** | `GroupStagePanel.tsx` — sorteo, canchas/olas, vista por grupo / por cancha, confirmación marcadores |
| **Confirmación marcadores** | Flujo report → confirm → cuenta en tabla; `closeGroupStage` exige 100% confirmed |
| **Mejores terceros ≠ bronce** | Copy + validación; wildcards vs `knockoutExtras.thirdPlaceMatch` |
| **Gestión shell** | `PartnerTorneoGestionShell` — tabs Operación / Configuración / Inscritos + rail KPIs |
| **Playbook rail** | `PartnerTorneoPlaybook.tsx` — checklist operativo + errores comunes |
| **Guardrails** | Cerrar grupos disabled sin confirmaciones; modales antes de sortear/cerrar/generar llave |
| **Layout grupos** | Chips horizontales; posiciones \| partidos 2 cols; tabla narrow con ↑ clasificados (sin barras verdes) |
| **Vista cancha** | `GroupStageScheduleView` — sin card sobre card; meta Q·Grupo·hora |
| **Realtime partner** | `TournamentGestionRealtime.tsx` |
| **Realtime jugador** | `TorneoPlayerRealtime.tsx` + carga partidos grupo en `player-matches.ts` |
| **TV live base** | `/t/[slug]/live?k=token`, `TournamentLiveDisplayClient`, `tournament-live.ts` |
| **Share bracket partner** | `PartnerBracketsScreenView` export/share |
| **Tests** | `tests/unit/group-playoff.test.ts`, `tournament-engine.test.ts`, smoke grupos · `6e375ca` |
| **Demo seed** | `scripts/seed-drews-demo-tournament.sql`, `seed-drews-demo-full-roster.ts` — "Open Demo MATCHPOINT" |

**Commits clave:** `af590ba` → `605b726` → `9dcf183`

### Torneos · monitores de cancha — **feature completa**

| Hecho | Detalle |
|-------|---------|
| **Schema Stage 1** | `20260626210000_tournament_court_monitors.sql` — tabla `tournament_court_monitors`; `20260626210001_tournament_monitors_flag.sql` — feature flag `tournament_monitors_enabled` |
| **Server actions** | `src/server/actions/tournament-monitors.ts` — assign/unassign/lookup |
| **Server actions operación** | `src/server/actions/tournament-operation.ts` — scoring por partido, rotación saque, auto-live/finish |
| **Panel partner** | `src/components/dashboard/partner/TournamentMonitorsPanel.tsx` — buscador de monitores, asignación, link copiable |
| **App móvil monitor** | `src/components/tournaments/MonitorAppClient.tsx` + ruta `/t/[slug]/monitor` |
| **Incidentes de partido** | `20260706000000_match_incidents.sql` — tabla `match_incidents`; `TournamentIncidentsFeed.tsx`; `20260630100000_seed_match_incident_reported_notif.sql` — notif kind `match_incident_reported` |
| **Scoring dinámico** | Monitor puede reportar puntos por set en tiempo real desde `/t/[slug]/monitor` |
| **Rotación de saque** | Tracking del equipo al saque por set desde el monitor |
| **Confirmación de bracket** | Monitor puede confirmar resultado de bracket match |
| **Auto-live / auto-finish** | Torneo pasa a `live` cuando empieza el primer partido; a `finished` cuando termina el último — `tournament-operation.ts` |
| **Feature flag** | `tournament_monitors_enabled` en `platform_config`; el panel solo aparece si está activo |
| **Migración `started_at`** | `73df96d` — fix `started_at` en monitores + reset de sorteo |

**Commits clave:** `66f6578` (Stage 1) → `497dc12` (Stage 2) → `68647ab` (incidentes) → `73df96d` (fix) → `90c78b9` (ELO + notif)

### Torneos · ELO automático

| Hecho | Detalle |
|-------|---------|
| **ELO base** | `058_matches_elo_trigger.sql` — trigger en `matches` estándar |
| **ELO torneos** | `20260702200000_elo_tournament_matches.sql` — triggers en `bracket_matches` y `tournament_group_matches`; calcula ELO automáticamente al confirmar `winner_side` |
| **Fix ELO mode** | `20260708000000_fix_tournament_elo_mode.sql` — corrección al campo `elo_mode` |
| **Ponderación** | `065_elo_partner_strength_weighting.sql` — ponderación por fortaleza del club |
| **Notif `tournament_finished`** | Se dispara en auto-finish del torneo · `90c78b9` |

**Importante:** cambiar `winner_side` en `bracket_matches` o `tournament_group_matches` **dispara el trigger ELO** automáticamente. No volver a calcular ELO manualmente.

### Torneos · scoring y operación avanzada

| Hecho | Detalle |
|-------|---------|
| **Scoring dinámico por set** | Configurador avanzado en creación de torneo (`7ebee23`) — presets con sets y puntos |
| **Scoring Liga (round_robin)** | `src/server/actions/tournament-liga.ts` + `4f20ae1` |
| **Cierre formal de torneo** | `tournament-close.ts` — deriva campeones, `4b805fd` |
| **Bracket accordion multi-categoría** | `PartnerBracketsScreen.tsx` — acordeón por categoría en panel partner · `61e6312` |
| **Sustituciones y walkover Stage 1** | `eb4d5b4` — schema, server actions, notif kinds |
| **Sustituciones y walkover Stage 2** | `98cf03a` — UI partner + admin, `DeclareWalkoverModal.tsx` |

### Torneos · inscripciones y walk-ins

| Hecho | Detalle |
|-------|---------|
| **Walk-ins con `guest_names`** | Brackets, eventos e inscritos muestran nombre real (no "Jugador" ni "Equipo") · `668b6a2`, `cd40448`, `c6c6ed5` |
| **Inscripción manual partner** | Walk-in + dobles soportados · `20bdd8d` |
| **Anular tx pendiente al cancelar** | `c183f80` — evita cobros zombie |
| **Revisión manual de comprobantes** | `src/server/actions/partner-tournament-registrations.ts` · `5888eb5` |
| **Inscripciones visibles sin sesión** | Eventos públicos · `7b7a31b` |

### TV live y subdominio

| Hecho | Detalle |
|-------|---------|
| **Subdominio `tv.matchpoint.top`** | `24500c2`, `d187b1e` — pantallas de venue |
| **Empty state sin slug** | `40a3dd2` |
| **TV ticker enriquecido** | `8e6ffb2` — nombres jugadores en dobles, sponsor slot mejorado |
| **Escenas: inscritos, tabla global, campeón** | `3139c32` |
| **Fix puntos reales** | `713938c` — muestra marcador real; oculta cajas si es set único |

### Partner · payouts y cobros

| Hecho | Detalle |
|-------|---------|
| **`payout_account` en `partner_orgs`** | `20260704120000_partner_payout_account.sql` + `3b6d36f` |
| **Modal de cobro unificado** | `d046ab4` — selector tipo + método |
| **Purga de comprobantes 24h** | `62f0fd9` — pg_cron purge |

### Infraestructura / admin / UX

| Hecho | Detalle |
|-------|---------|
| **PDF calendario de partidos** | Route handler + componente + botón partner · `f9456ef` |
| **Buscador de monitores** | Panel partner busca monitor por nombre/email · `69fef27` |
| **Admin: vincular/desvincular clubes** | `ac5cfa3` — modal en admin partners |
| **Admin: revocar rol admin** | `df733c1` |
| **Admin: seed torneos testing** | `81dbdbc` |
| **Mapa de clubes MapLibre** | `5d08567` — reemplaza SVG hardcodeado |
| **Migración dominio** | `35ba866` — `matchpointgithub.vercel.app` → `matchpoint.top` |
| **Redirect www → matchpoint.top** | `1bbb1eb` (301) |
| **Audit v2 completo** | `129100f` — RLS, realtime, auth guards, broadcast, types; `093ef52` hardening Ola 0-2 |
| **Paywall `createQuedada`** | `c56f321` — MAT-70 |
| **Audit `employee` + onboarding** | `f9e40f9` |

### Quedadas

| Hecho | Detalle |
|-------|---------|
| Audit + fixes plan | transcript mayo 29 |
| Motores de juego (Canguil, Americano, Mexicano, RR, singles) | `QuedadaGameView`, engine backend |
| Vista jugador rediseñada | `QuedadaDetailView` — 4 cards snapshot, design system |
| Realtime jugador | `useRealtimeRefresh` en detail view |
| Redirect a gestión al crear | implementado en sesión |
| Vista por cancha en gestión | manage panel |
| Fix migraciones (`live_at`, etc.) | varios commits |
| Giveaways v2 feed + manual submissions | `3373076`, mig 20260606/07120000 |
| Mis sorteos jugador | branch `cursor/giveaways-mis-sorteos-v11` merged |
| Sorteo en vivo club | gestión + vista jugador |

### Landing + Auth

| Hecho | Detalle |
|-------|---------|
| Audit landing/auth completo | transcript inicio 13518134 |
| sitemap/robots, metadata | `sitemap.ts`, fixes SEO |
| Hardening sesión (rol cookie vs role_assignments) | `getSession` |
| Hydration fixes landing | varios |
| Footer, marquee clubs, promos con slug | `page.tsx`, `Home.tsx` |
| Stats landing cacheadas 24h | `fb65076` |

---

## Lógica torneos grupos (referencia rápida)

```
Config (antes sorteo) → Sortear → group_stage → confirmar TODOS → close → group_complete → generateKnockout → knockout
```

| Concepto | Qué es |
|----------|--------|
| **Clasifican por grupo** | Top N de cada grupo (`advancePerGroup`) |
| **Mejores terceros globales** | Wildcards: 3.º de grupo que entran extra a llave (`wildcards.count`) |
| **Partido de bronce** | Perdedores semifinal, podio torneo (`knockoutExtras.thirdPlaceMatch`) |
| **Standings** | Solo partidos `status === 'confirmed'` |

```
clasificados = grupos × advancePerGroup + mejores_terceros
bracketSize = nextPowerOfTwo(clasificados)
```

---

## Mapa de archivos — torneos grupos

```
src/app/dashboard/partner/torneo/[id]/page.tsx
src/components/dashboard/partner/
  PartnerTorneoGestionShell.tsx
  PartnerTorneoPlaybook.tsx
  PartnerTorneoRailLinks.tsx
  PartnerTorneoOperacionPanel.tsx
  GroupStagePanel.tsx
  GroupStageScheduleView.tsx
  CategoryGroupConfigPanel.tsx
  TournamentGestionRealtime.tsx
  PartnerBracketsScreenView.tsx
  PartnerBracketsScreen.tsx       ← accordion multi-categoría
  TournamentMonitorsPanel.tsx     ← asignar monitores
  TournamentIncidentsFeed.tsx     ← feed de incidentes
  DeclareWalkoverModal.tsx        ← walkover
  ScoreMatchCard.tsx
src/components/dashboard/user/
  TorneoPageRouter.tsx
  TorneoDetailView.tsx
  TorneoPlayerRealtime.tsx
src/components/tournaments/
  MonitorAppClient.tsx            ← app móvil del monitor
  TournamentLiveDisplayClient.tsx
src/lib/tournaments/group-stage.ts
src/lib/torneos/player-matches.ts
src/server/actions/tournament-group-stage.ts
src/server/actions/tournament-monitors.ts   ← assign/unassign/lookup
src/server/actions/tournament-operation.ts  ← scoring, saque, auto-live/finish
src/server/actions/tournament-close.ts
src/server/actions/tournament-liga.ts
src/server/queries/tournament-player-page.ts
tests/unit/group-playoff.test.ts
```

---

## Rutas importantes

| Rol | Ruta |
|-----|------|
| Partner gestión torneo | `/dashboard/partner/torneo/[id]` |
| Partner brackets | `/dashboard/partner/p-brackets` |
| Jugador torneo | `/dashboard/user/torneo/[id]` |
| Club manager torneo | `/dashboard/owner/club-torneo/[id]` o `[role]/torneo/[id]` |
| TV live | `/t/[slug]/live?k=TOKEN` |
| Monitor de cancha | `/t/[slug]/monitor` |
| TV subdominio | `tv.matchpoint.top` |
| Público evento | `/eventos/[slug]` |

---

## Pendiente / NO está hecho (safe to implement)

- [ ] **TV live pulida** — base existe; usuario dijo que la terminará después
- [ ] **Playbook multi-categoría** — `groupMatchStats` solo 1ª categoría en page.tsx
- [ ] **E2E** flujo completo grupos (agent-browser o Playwright)
- [ ] **Notifs pendientes** en `02-notifications.md` — email channel, push web
- [ ] **Docs §13** — actualizar spec doc con flujo confirm + wildcards (código ya diverge un poco del doc T0–T4)
- [ ] **Transferencia cupo** inscripciones — explícitamente no existe
- [ ] **Regenerar types** Supabase si faltan columnas en `lib/db/types.ts` (usar casts temporales como `partner_link_code`)

---

## Migraciones que deben estar aplicadas (prod)

Si algo "no existe" en runtime, verificar en Supabase:

- `20260603180000_tournament_group_stage.sql` — **crítica para grupos**
- `078_realtime_publication_tournament_subtables.sql`
- `20260626210000_tournament_court_monitors.sql` — **crítica para monitores**
- `20260626210001_tournament_monitors_flag.sql`
- `20260702200000_elo_tournament_matches.sql` — **crítica para ELO torneos**
- `20260708000000_fix_tournament_elo_mode.sql`
- `20260706000000_match_incidents.sql`
- `20260704120000_partner_payout_account.sql`
- Migraciones torneos 064–077 (categorías, cronograma, premios, modality, etc.)

---

## Sensibilidades del usuario (diseño / producto)

- **No** estética "IA genérica": barras verdes gruesas, fondos tintados en tablas
- Tablas: líneas neutras, indicadores discretos (↑ para clasificados)
- Copy claro: distinguir mejores terceros vs partido de bronce
- Espacio eficiente en panel grupos
- Tras sorteo: config competitiva **bloqueada**
- Commits en `main` directo (usuario prefirió deploy rápido; si pide ramas usar `cursor/`)

---

## Comandos

```bash
npm run dev
npm run test:unit      # 33 tests
npm run typecheck
npm run build

# UI E2E manual
npx agent-browser open http://localhost:3000/dashboard/partner/torneo/<UUID>
npx agent-browser snapshot

# Demo torneo (SQL en Supabase)
# scripts/seed-drews-demo-tournament.sql
```

---

## Qué NO asumir

1. **Next.js "clásico"** — leer `node_modules/next/dist/docs/`; hay breaking changes
2. **Columna `player_id`** en registrations — es `player_ids[]`
3. **DUPR** — usar **MPR** en copy
4. **Voseo** — prohibido en UI/commits/chat (ver AGENTS.md)
5. **Rehacer confirmación de marcadores** — ya existe `confirmGroupMatch`
6. **Rehacer realtime jugador** — ya existe `TorneoPlayerRealtime`
7. **Jugador ve grupos antes de bracket** — ya carga en `loadTournamentPlayerGroupData`
8. **Calcular ELO manualmente** — hay triggers automáticos en `bracket_matches` y `tournament_group_matches`; disparar al setear `winner_side`
9. **Rehacer monitores** — `TournamentMonitorsPanel`, `MonitorAppClient`, `tournament-monitors.ts` están completos
10. **Notifs `tournament_published`, `match_result_reported`, `tournament_finished`** — ya implementadas (ver `02-notifications.md`)

---

## Commits recientes en main (referencia)

```
90c78b9 fix(mpr): ELO de partidos de torneo y notif tournament_finished en auto-finish
73df96d fix(monitors): migración started_at, auto-live/finish del torneo y reset de sorteo
68647ab feat(monitors): incidentes de partido persistentes
d4a52dd feat(monitors): scoring dinámico por partido, rotación de saque y confirmación de bracket
cf2748b feat(monitors): scoring dinámico, siguiente partido y centro de operaciones en vivo
61e6312 feat(brackets): acordeón multi-categoría en el panel de brackets del partner
69fef27 fix(partner): buscador de monitores, PDF, config competitiva, TV live y monitor page
8e6ffb2 feat(tv-live): ticker enriquecido + nombres de jugadores en dobles
5888eb5 feat(partner): revisión manual de comprobantes de torneo
20bdd8d feat(partner): inscripción manual con soporte walk-in y dobles
3b6d36f feat(partner): cuenta de cobro bancaria para recibir payouts
66f6578 Monitores Stage 2: app mobile monitor + panel partner + ruta
eb4d5b4 Sustituciones y walkover Stage 1: schema, server actions y notif kinds
98cf03a Sustituciones y walkover Stage 2: UI partner + admin
9dcf183 Torneos grupos: gestión partner, realtime jugador y guardrails operativos
605b726 Torneos partner: marcadores, config grupos, wildcards, pantalla TV
```

---

*Actualizar este archivo al cerrar cada iteración grande. Última actualización: `90c78b9` (junio 2026).*
