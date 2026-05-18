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
