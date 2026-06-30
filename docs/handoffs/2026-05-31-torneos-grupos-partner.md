# Handoff · Torneos grupos + gestión partner (31 may 2026)

> **Supersedido parcialmente por** [`CLAUDE-CODE-MASTER.md`](./CLAUDE-CODE-MASTER.md) — usa el master para migración completa (todos los commits/dominios).
> Este archivo conserva detalle fino solo de la iteración grupos-partner.

> Copia el bloque **Prompt para Claude Code** al iniciar sesión en Claude Code.
> Borra o archiva este archivo cuando ya no lo necesites.

---

## Prompt para Claude Code

```
Estás en MATCHPOINT (Next.js + Supabase), repo matchpointgithub, branch main @ 9dcf183.

Contexto reciente: terminamos la fase de torneos groups_to_knockout para partners y jugadores.

LEE ANTES DE CODEAR:
- AGENTS.md (reglas duras: docs previos, español ecuatoriano neutro con tuteo, marca MATCHPOINT)
- docs/product/01-tournaments.md (flujos torneo)
- docs/architecture/50-realtime.md (realtime)

Estado funcional:
- Partner gestión: /dashboard/partner/torneo/[id] — tabs Operación | Configuración | Inscritos + rail sticky
- Grupos: reportar → confirmar → cuenta en standings; cerrar fase exige todos confirmed
- Config: mejores terceros globales (wildcards) ≠ partido de bronce (knockoutExtras.thirdPlaceMatch)
- Jugador: /dashboard/[role]/torneo/[id] — carga partidos de grupo + bracket + realtime (TorneoPlayerRealtime)
- TV live: /t/[slug]/live?k=token — stub mínimo, usuario dijo que lo pulirá después

Torneo demo: scripts/seed-drews-demo-tournament.sql · "Open Demo MATCHPOINT · Jun 2026"

Pendiente prioritario (si el user no indica otra cosa):
1. Pulir pantalla TV única (/t/[slug]/live)
2. E2E browser de flujo partner: config → sorteo → confirmar marcadores → cerrar grupos → llave
3. Verificar multi-categoría en playbook (matchStats solo primera categoría activa)

No commitear supabase/.temp/. Seguir convenciones existentes; diff mínimo.
```

---

## Commits relevantes (ya en origin/main)

| SHA | Resumen |
|-----|---------|
| `9dcf183` | Gestión partner (shell/rail/playbook), guardrails cerrar grupos, realtime jugador, carga fase grupos en vista player |
| `605b726` | Marcadores grupos (confirm), config wildcards/bronce, pantalla TV base, share bracket partner |

---

## Lógica de negocio (no confundir)

### Mejores terceros globales
- Equipos en posición `advancePerGroup + 1` de cada grupo que entran extra a la llave
- Config: `wildcards: { mode: "best_thirds_global", count: N }`
- Requiere `advancePerGroup >= 2`
- Código: `pickBestThirdsGlobal()` en `src/lib/tournaments/group-stage.ts`

### Partido de bronce
- Perdedores de semifinal → match `is_bronze: true`, `round: 0`
- Config: `knockoutExtras: { thirdPlaceMatch: true }`
- No tiene relación con terceros de grupo

### Fórmula llave
```
clasificados = grupos × advancePerGroup + mejores_terceros
bracketSize = nextPowerOfTwo(clasificados)  → byes si sobra
```

### Marcadores en grupos
| status | Efecto |
|--------|--------|
| scheduled/pending | No cuenta en standings |
| reported | Visible; partner debe Confirmar |
| confirmed | Cuenta en standings y clasificación |

---

## Mapa de archivos clave

### Partner — gestión torneo
- `src/app/dashboard/partner/torneo/[id]/page.tsx` — server page, rail, tabs
- `src/components/dashboard/partner/PartnerTorneoGestionShell.tsx` — tabs Operación/Config/Inscritos
- `src/components/dashboard/partner/PartnerTorneoPlaybook.tsx` — checklist rail (evitar errores)
- `src/components/dashboard/partner/PartnerTorneoRailLinks.tsx` — accesos rápidos
- `src/components/dashboard/partner/PartnerTorneoOperacionPanel.tsx` — wrapper operación
- `src/components/dashboard/partner/GroupStagePanel.tsx` — sorteo, canchas, marcadores, cerrar grupos
- `src/components/dashboard/partner/GroupStageScheduleView.tsx` — vista por cancha
- `src/components/dashboard/partner/CategoryGroupConfigPanel.tsx` — formato competitivo
- `src/components/dashboard/partner/TournamentGestionRealtime.tsx` — realtime partner page

### Server / lib
- `src/server/actions/tournament-group-stage.ts` — draw, report, confirm, close, generateKnockout
- `src/lib/tournaments/group-stage.ts` — standings, qualifiers, validation, preview

### Jugador
- `src/app/dashboard/[role]/torneo/[id]/page.tsx`
- `src/components/dashboard/user/TorneoPageRouter.tsx`
- `src/components/dashboard/user/TorneoDetailView.tsx` — tabs Camino/Completo/Detalles/Resultados
- `src/components/dashboard/user/TorneoPlayerRealtime.tsx` — **nuevo** realtime jugador
- `src/lib/torneos/player-matches.ts` — carga partidos grupo + bracket
- `src/server/queries/tournament-player-page.ts`

### Brackets / TV
- `src/components/dashboard/partner/PartnerBracketsScreenView.tsx`
- `src/components/tournaments/TournamentLiveDisplayClient.tsx` — TV `/t/[slug]/live`

### Tests
- `tests/unit/group-playoff.test.ts`

---

## Realtime (jugador)

`TorneoPlayerRealtime` escucha:
- `tournaments`, `tournament_categories`, `registrations`
- `tournament_groups`, `tournament_group_members`, `tournament_group_matches`
- `brackets`, `bracket_matches`

Debounce: `REALTIME_DEBOUNCE.LIVE` (300 ms) → `router.refresh()`.

**Limitación conocida:** standings del jugador solo cuentan partidos `confirmed` (igual que partner). Reportados se ven en marcador del partido pero no mueven tabla hasta confirmar.

---

## Flujo operativo partner (orden)

1. **Configuración** → guardar formato (bloqueado tras sorteo)
2. Aceptar inscritos suficientes (`acceptedCount >= groupsCount`)
3. Cerrar inscripciones (recomendado)
4. **Operación** → canchas → Sortear grupos (confirmación modal)
5. Reportar + **Confirmar** cada partido
6. Cerrar fase de grupos (botón disabled hasta 100% confirmed)
7. Generar cuadro final
8. Brackets en vivo (`/dashboard/partner/p-brackets`)

---

## Sensibilidades de diseño (usuario)

- Rechaza barras/contornos verdes genéricos en tablas de posiciones
- Prefiere tablas con líneas neutras, indicador discreto (↑) para clasificados
- Copy claro; eficiencia de espacio en panel grupos (chips grupos, 2 cols posiciones|partidos)
- Rail sticky 320px — `DashboardChrome` usa `overflow-x-clip` (no hidden) para sticky

---

## Comandos útiles

```bash
npm run dev
npm run test:unit
npm run typecheck
npm run build

# E2E UI (devDependency)
npx agent-browser open http://localhost:3000/dashboard/partner/torneo/<id>
npx agent-browser snapshot
```

---

## Pendiente / no hecho

- [ ] TV live pulida (usuario: "lo haré después")
- [ ] Playbook: `groupMatchStats` solo calcula categoría inicial en page.tsx
- [ ] Tests E2E flujo grupos completo
- [ ] Multi-categoría: playbook y stats agregados por categoría

---

## Chats Cursor de referencia

Transcript principal de esta iteración: agent-transcripts `13518134-194d-447f-82c8-f02d4885b94b.jsonl`
