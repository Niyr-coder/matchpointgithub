# Multideporte (switch global)

Pickleball es el deporte primario de MATCHPOINT. El switch **multideporte**
decide si Pádel y Tenis están disponibles en toda la plataforma.

> **Default: OFF** → solo Pickleball en selectores, modales, forms y filtros.
> Al activarlo aparecen los 3 deportes.

## Cómo funciona

- **`platform_config.multisport_enabled`** (mig 123, default `false`).
- **RPC público `fn_multisport_enabled()`** (SECURITY DEFINER, grant anon+
  authenticated) — porque `platform_config` es admin-RLS y el root layout
  (incluso anónimo en landing) necesita leerlo. Patrón de `fn_get_system_user_id`.
- **`src/lib/sports.ts`** — fuente única: `ALL_SPORTS`, `PRIMARY_SPORT`,
  `SPORT_META` (labels), `sportLabel()`, `enabledSports(multisport)`.
- **`src/lib/sports.server.ts`** — `getMultisportEnabled()` (cached) +
  `getEnabledSports()` para server components.
- **`SportsProvider` + `useEnabledSports()`** (`src/components/SportsProvider.tsx`)
  — sembrado UNA vez en el root layout (`app/layout.tsx`) con el valor del RPC;
  expone `{ multisport, sports, single }` a todo el árbol cliente.

## Regla de UI

- Los selectores de deporte **consumen `useEnabledSports().sports`**, nunca
  listas hardcodeadas.
- Cuando `single` (solo Pickleball), el selector **se oculta** y el deporte
  queda implícito (pickleball preseleccionado).

## Refactorizado (consume el helper)

- ✅ `BuscoPartidoScreenView` — feed filters + modal publicar.
- ✅ `OnboardingWizard` — selector de deporte principal (se oculta si single).
- ✅ `CrearMatchModal` — Step 1 deporte (filtra a habilitados; quita el
  gating "Pronto" cuando multisport está ON).

## Cola pendiente (refactor mecánico al helper)

Estos hoy ya están **hardcoded a pickleball** (o lo muestran como filtro de
solo-lectura), así que con multisport OFF se comportan correcto. Cuando se
quiera multisport ON completo, deben pasar al helper:

- `CrearJuegoModal` — Round Robin, hoy pickleball fijo.
- `CreateTournamentFlow` — "sport bloqueado" a pickleball.
- Filtros de ranking (`RankingScreen`, `RankingPageView`).
- Landing: `ClubesPageView`, `EventosPageView`, `CoachesPageView` (filtros).
- `SolicitarClubScreenView`, métricas admin, reportes club.

Tracked en `04-placeholders.md`.

## Admin

Hoy el toggle se cambia en `platform_config.multisport_enabled` (vía SQL o
cuando se agregue el control en `AdminConfigScreen`). **Pendiente**: control
visual en `AdminConfigScreen`.

```sql
-- Activar multideporte:
update platform_config set value = 'true'::jsonb where key = 'multisport_enabled';
```

## Cosas que rompen seguido

- Un selector nuevo que liste deportes a mano → romperá la regla. Siempre
  `useEnabledSports()`.
- El RPC debe estar grant a **anon** también (landing sin login lee el flag).
- El default del estado de sport en un form debe ser `sports[0]`
  (pickleball), no un literal `"padel"`.
