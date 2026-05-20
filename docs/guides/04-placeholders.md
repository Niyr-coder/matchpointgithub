# Placeholders, stubs y WIP

> Inventario honesto de qué está fake / hardcoded / a medio armar. Si vas a
> implementar una feature aquí, **leé este doc primero** — probablemente ya
> hay un placeholder al que tienes que reemplazar (no agregar otro paralelo).

Convención:
- 🔴 **Mentira visible** — el UI muestra un valor falso al usuario real
- 🟡 **Placeholder honesto** — visible y marcado como "Próximamente" o stub
- 🟢 **Stub interno** — solo lo ven devs, no afecta UX

---

## 1. 🔴 Hardcodes pendientes de migrar

### `DEFAULT_COMMISSION_PCT = 0.2` — fallback coach
- **Archivo**: `src/components/dashboard/coach/CoachPagosScreen.tsx:6`
- **Estado**: Mejorado vs antes (ahora es solo fallback cuando no hay row
  en `coach_commissions`). Pero el 20% sigue siendo arbitrario.
- **Para quitarlo**: migrar a `platform_config.default_coach_commission_pct`
  + actualizar helper.

### Curvas easing en lugar de tokens
- **Archivo**: cada style inline que usa `cubic-bezier(0.23, 1, 0.32, 1)`
  directo.
- **Estado**: Funciona pero duplicado. `globals.css` tiene `--ease-out`,
  `--ease-in-out`, `--ease-drawer` definidos.
- **Para quitarlo**: barrido global reemplazando literal por var. NO urgente.

### Default `max_participants = 32` al crear torneo
- **Archivo**: `src/components/dashboard/partner/CreateTournamentFlow.tsx`
- **Estado**: Default UI razonable, pero asume "torneo típico".
- **Para quitarlo**: migrar a `platform_config.default_tournament_max_participants`.

---

## 2. 🟡 Placeholders honestos (visibles + marcados)

### `RoleScreenStub` — secciones del sidebar sin pantalla real

- **Archivo**: `src/components/dashboard/RoleScreenStub.tsx`
- **Cuándo aparece**: cada `(role, section)` que **no está** en el `SCREENS`
  map de `src/app/dashboard/[role]/[section]/page.tsx`.
- **Copy**: *"Pantalla específica del rol [ROLE]. Por ahora ves solo el
  Home con fidelidad completa; cada sección del sidebar tendrá su propia
  vista en la próxima iteración."*
- **Cobertura actual** (qué cae a stub):

| Rol | Items sin pantalla real |
|---|---|
| `employee` | `e-soporte` (no implementado) — 2 items totales sin pantalla |
| `coach` | 1 item sin pantalla |
| `manager` | 1 item sin pantalla |
| `partner` | 1 item sin pantalla |
| `owner` | 1 item sin pantalla |
| `user` | algunas secundarias (`team`, `solicitar-club` están reales) |
| `admin` | 100% cubierto |

### `PLACEHOLDER_COUNT` en pantallas admin

Cuando una pantalla aún no tiene datos reales, renderiza filas vacías
opacas con la palabra "Sin datos aún" — patrón consistente. Ver:

- `AdminAuditScreenView.tsx:11` — `PLACEHOLDER_COUNT = 6`
- `AdminBroadcastScreenView.tsx:52-53` — sent=3, draft=2
- `AdminEventsScreenView.tsx:50` — count=4
- `AdminPagosScreenView.tsx:67` — count=4

**Importante**: cuando data real llega, el componente reemplaza placeholders
sin re-render del layout (consistent UX). Si vas a refactorear: respetar el
patrón opacity 0.5 + dashed border que ya está estandarizado.

### `BADGES` en UserHome
- **Archivo**: `src/components/dashboard/user/UserHomeView.tsx:1006`
- **Estado**: array hardcoded de 5 badges (`1° match, Racha 5, Top 50,
  Doblete, Campeón`) con flag `on` literal.
- **Counter dinámico** (sí, fixed): muestra `unlocked / total` desde el
  array (`MyBadgesSection` calcula con filter).
- **Para hacerlo real**: tabla `badges` (catálogo) + `player_badges` (qué
  desbloqueó cada user) + query desde server. Hoy todo es ilustrativo.

---

## 3. 🟢 Stubs internos / Features pending

### `payouts` table existe pero no se crea automáticamente
- **Tabla**: `public.payouts` (mig 081)
- **Estado**: schema + RLS listos. UI lee rows en `AdminPagosScreen`. Pero
  **nadie crea rows** — se insertan a mano via SQL al cerrar período.
- **Para activar**: cron mensual que lea `transactions captured` por
  partner/club y reste `take_rate_pct` del config.

### Cron `cleanup-expired-plans` corre pero no notifica al user
- **Mig**: 049
- **Estado**: pasa subs vencidas a `expired` + downgrade del profile. **No
  envía notif al user** ("Tu MatchPoint+ venció").
- **Para activar**: agregar `notification_jobs` insert en el SQL del cron
  para cada user que se downgradeó.

### `feature_flags` table existe pero no se usa
- **Tabla**: `feature_flags` (algún mig viejo)
- **Estado**: schema + tabla. UI admin (`AdminFlagsScreen`) puede listarlas
  pero ninguna feature actual chequea flags realmente.
- **Para activar**: helper `requireFeatureFlag(key)` en server actions +
  client-side gating con tooltip "feature disabled" en botones.

### Match results / bracket progression
- **Estado**: `generateBracket` crea estructura random + `bracket_matches`
  rows. **No hay UI** para reportar resultados, ni lógica que avance
  ganadores a la siguiente ronda.
- **Para activar**: action `reportMatchResult` (validar score válido +
  rellenar `winner_side` + crear next-round match si aplica) + UI en
  `/dashboard/partner/p-brackets`.

### Email channel del dispatcher
- **Estado**: módulo `src/lib/notifications/email-templates.ts` existe,
  cron `dispatch-email` existe, pero ningún kind tiene `'email'` en
  `default_channels`. Todo es `inapp`.
- **Para activar**: agregar `'email'` al kind + handler en email-templates
  para ese kind + setup SMTP / Resend / SES.

### Push notifications
- **Estado**: cero implementación. PWA tampoco está instalable.
- **Para activar**: agregar manifest + service worker + opt-in modal +
  almacenar tokens en `user_push_tokens` (tabla por crear).

### Teams · admin governance ausente (gap retroactivo del Stage 1-3)
- **Estado**: feature teams completo backend + UI player, pero NO hay
  pantalla admin para listar todos los teams, ver caps por team, forzar
  override de caps, banear/disolver desde admin, ni audit log filtrado
  por team. Soporte hoy tendría que abrir Supabase Studio para
  investigar un team problemático.
- **Detección**: la skill `matchpoint-feature-plan` (actualizada en
  esta misma sesión) lo flagearía como antipatrón. Se nos pasó porque
  el plan original no incluía §1.9 Admin governance.
- **Para activar** (cuando se decida priorizar):
  1. Nueva pantalla `AdminTeamsScreen` en
     `src/components/dashboard/admin/AdminTeamsScreen.tsx`.
  2. Sidebar item `admin-teams` en `MP_ROLES.admin.sidebar`.
  3. Capacidades: listar all teams (con filtros sport/captain/clubId),
     drilldown a roster, override `rename_count`, disolver con motivo
     (audit log), ver historial de invites.
  4. Reflejar permiso en `AdminRolesScreen` (catálogo operativo de
     permisos admin).

### Welcome DM templates hardcoded en `src/lib/messages/system.ts`
- **Archivo**: `src/lib/messages/system.ts` (constante `WELCOME_TEMPLATES`).
- **Estado**: 4 templates de bienvenida (signup, team_created, premium_activated, onboarding_completed) viven en código TS, no en DB.
- **Para activar**:
  1. Crear key `platform_config.system_message_templates` con JSON de
     templates por kind.
  2. `renderTemplate` lee de `platform_config` en runtime (vía RPC
     `fn_get_system_message_templates` SECURITY DEFINER).
  3. Admin UI en `AdminBroadcastScreen` o nueva `AdminTemplatesScreen`
     para editar.
- **Por qué importa**: hoy editar el copy del welcome requiere PR + deploy.
  Marketing/producto debería poder iterar copy sin pasar por dev.

### Admin "broadcast as MatchPoint" ausente
- **Estado**: el perfil oficial MatchPoint existe (mig 104) y manda
  welcome DMs automáticos. Pero admin NO puede usar MatchPoint para
  mandar broadcasts manuales (anuncio plataforma, alerta, etc).
  `AdminBroadcastScreen` actualmente manda como el propio admin user.
- **Para activar**:
  1. Toggle en AdminBroadcastScreen: "Enviar como MatchPoint Oficial"
     (solo visible para admin).
  2. Server action `sendBroadcastAsSystem(recipientIds, body)` que
     internamente usa `fn_send_system_message` por cada recipient.

### Teams · feature flag ausente (gap retroactivo)
- **Estado**: los caps de teams (12/24, 3/∞, 2/5) están "encendidos"
  para todos los users en producción. No hay killswitch — si los caps
  generan fricción inesperada (ej. teams legítimos con >12 miembros
  pre-existentes), no se puede pausar sin redeploy.
- **Mitigación parcial**: `platform_config.team_caps` permite ajustar
  los números sin redeploy (subir el cap free a 50 = killswitch suave).
- **Para activar killswitch real**:
  1. Seed `feature_flags.teams_caps_enforced` con `enabled_default: true`.
  2. `getTeamCaps` lee el flag — si está off, devolver caps "infinitos"
     (Number.MAX_SAFE_INTEGER) para todos.
  3. UI deja de mostrar badges/banners cuando flag off.

---

## 4. UI con datos ilustrativos (estilo demo)

Pantallas que actualmente muestran datos plausibles pero **fake/seed para
demo**, no productivos:

- `AdminBroadcastScreenView` — mensajes de ejemplo
- `AdminAuditScreenView` — algunas filas seed para demo (si la tabla está
  vacía en dev)
- `RatingSparkline` en UserHome cuando un user nuevo no tiene history —
  muestra una línea plana en `STARTING_RATING_VIEW = 2500`

Cuando los reemplaces con data real, mantener el visual idéntico para no
romper el lenguaje del dashboard.

---

## 5. Botones sin handler funcional (audit)

Del audit per-role:

| Botón | Archivo | Estado |
|---|---|---|
| "Nueva campaña" | `AdminBroadcastScreenView:241` | sin onClick |
| "+ Agregar filtro" | `AdminClubsScreenView:479` | sin onClick |
| "Guardar config" | `AdminConfigScreenView:95` | sin onClick |
| "+ Crear evento" (admin) | `AdminEventsScreenView:205` | sin onClick |
| "Reportar abuso" | `AdminModScreenView:164` | sin onClick |

Hay 7+ más en owner/coach/employee. Cuando los implementes, agregar al
server action correspondiente + wire onClick + toast de resultado.

---

## 6. Reglas

1. **Si vas a agregar UI**, primero buscá si hay stub existente — no metas
   un componente paralelo, reemplazá el stub.
2. **Marcá explícitamente** todo lo que sea WIP. Usá `// TODO:` o un copy
   visible al user ("próximamente", "en desarrollo").
3. **No mentir al user**. Mejor "—" o "Sin datos" que un número fake.
4. **Cuando convertís un placeholder en real**, sacarlo de este doc.

## 7. TODOs grandes

- [ ] Eliminar `BADGES` literal de UserHome → tabla real
- [ ] Cron que crea `payouts` automáticamente
- [ ] Cron `cleanup-expired-plans` enviando notif
- [ ] Helper `requireFeatureFlag()` + uso en features no-listas
- [ ] Match result reporting + bracket progression
- [ ] Email channel real
- [ ] Cubrir items sin pantalla de employee/coach/manager
- [x] ~~Customización de perfil — `card_style` no renderiza en listados~~.
  ✅ Resuelto en Stage 4 (mig 115 abrió SELECT a `profile_cosmetic_grants`,
  AmigosScreen + TeamScreen resuelven ownership por user, FriendCard +
  roster filas aplican `cardStyleCss` y `accentHex`). Falta `/players/[username]`
  card aparte si quieres tematizar más allá del header — el header ya
  consume `ProfileHeaderCard` con todo.
- [ ] **Busco partido (match seeks)** — items diferidos de v1:
  - Sidebar item `busco-partido` es visible con el flag `match_seeks_enabled`
    en `false` → lleva a `BuscoPartidoComingSoon` ("Pronto") para todos.
    Placeholder deliberado pre-launch; al activar el flag se vuelve la
    pantalla real. Alternativa futura: filtrar el item del sidebar por flag
    efectivo (requiere plumbing de flags en `DashboardChrome`).
  - Chat `kind='match'` usa título genérico "Partido", sin avatar/icono
    distintivo en `MensajesScreenView`. Funciona, falta polish visual.
  - Filtro "mi club" en el feed pendiente — el perfil no tiene `home_club_id`.
  - Caso dobles "completar mi equipo con randoms" fuera de v1.
  - Sin pantalla admin dedicada para moderar avisos (solo audit log).
  - `Database` types no incluyen `match_seeks*` (casts `LooseClient`, igual
    que `matches.ts`). Regenerar types es mantenimiento aparte.
- [ ] **No-show + fiabilidad — UI restante** (flag `match_reliability_enabled`
  OFF; ver `product/04-matches-lifecycle.md`):
  - ✅ Botón "¿No apareció?" en el `MatchActionBar` del chat (gated por flag +
    matchTimePassed + por participante → `reportNoShow`).
  - Pendiente: badge de fiabilidad (`reliabilityTier`) en perfil /
    `AdminUsersScreen`.
  - Pendiente: incrementar `player_reliability.cancellations` en `cancelMatch`
    (hoy solo no-show mueve el score).
- [ ] **Multideporte — cola de refactor** (ver `product/05-multisport.md`):
  - ✅ Hecho: busco-partido, onboarding, CrearMatch, **landing /ranking**
    (`RankingPageView`), **toggle admin** en `AdminConfigScreen` (sección
    "Deportes"). El ranking del dashboard ya es pickleball-fijo.
  - Pendiente (filtros de deporte en superficies secundarias):
    `ClubesPageView`, `EventosPageView`, `CoachesPageView`,
    `SolicitarClubScreenView`. `CrearJuegoModal` y `CreateTournamentFlow`
    están pickleball-locked por diseño (correctos con flag OFF; cuando se
    quiera multisport ON en torneos hay que abrir esos flujos).
- [ ] **Cosmetics: self-service purchase flow** (Stage 4 de customización).
  Hoy fase 1 es admin grant manual tras pago manual. Falta UI en
  `/dashboard/user/personalizar` para que el user clickee "Comprar pack
  X", suba comprobante, y admin apruebe en `/dashboard/admin/admin-cosmetics`
  (mismo panel hoy ya hace grant, faltaría estado `pending` en
  `profile_cosmetic_grants` + integrar con flow de comprobantes existentes
  de MP+).
