# QA · Rol user (agent-browser)

> Recorrido automatizado con `agent-browser`. Test user
> `qa-user-2@matchpoint.test` (password `QaTest1234!`).
>
> Fecha: 2026-05-18.

## 🔴 Bugs críticos encontrados y fixeados durante el test

### Bug 1 · Signup completamente roto

**Síntoma**: cualquier intento de signup en `/` modal o vía
`auth.admin.createUser` devolvía *"Database error saving new user"*.

**Causa real**: trigger `tg_seed_player_stats` (mig 028) usaba
`on conflict (user_id, sport)` pero la mig **064** cambió la PK de
`player_stats` a `(user_id, sport, mode)`. El constraint viejo no existe
más, Postgres aborta toda la cadena de signup.

**Fix**: migration **084** (`fix_seed_player_stats_mode`) — el trigger
ahora seedea 6 rows (3 deportes × 2 modes) y usa
`on conflict (user_id, sport, mode)`. Verificado: signup completo
end-to-end funciona, profile + 1 role + 6 player_stats creados.

**Bug colateral arreglado en el camino**: trigger
`tg_handle_new_auth_user` usaba `on conflict do nothing` sin target en
`role_assignments` (unique multi-columna con NULLs). Fix preventivo en
migration **083** — chequeo con `IF NOT EXISTS`.

## 🟡 Bugs cosméticos / UX

### Onboarding wizard
- **Paso 4 "Todo listo"** muestra valores raw en lugar de labels
  traducidos: `pickleball` (lowercase) y `intermediate` (en inglés).
  Debería decir "Pickleball" y "Intermedio".

### UserHome
- **MP RATING** muestra "2.50" cuando el seed inicial es 2500.
  Confirmar si la división por 1000 implícita es deseada (escala MPR
  va 2.0-8.0 así que tiene sentido — pero entonces el seed debería ser
  2.5, no 2500, para no requerir conversión en cada lectura).
- **Sidebar badges hardcoded** (`Ranking 12`, `Mensajes 3`, `Mis clases 2`)
  vienen de `MP_ROLES` literal, no de queries reales. Ya documentado en
  `guides/04-placeholders.md`.

### Botones sin handler funcional (3 encontrados, probablemente hay más)
- **Header "RESERVAR"** (top bar) — no abre nada, no navega.
- **"ACTIVAR MATCHPOINT+ →"** (banner upgrade) — no navega a
  `/dashboard/user/mi-plan` como se esperaría.
- **Quick Action "Reservar cancha"** — no abre drawer ni navega.

Audit anterior ya había listado ~12 botones sin handler en otros roles;
estos 3 son del rol user y suman a la lista de pendientes.

## 🟢 Lo que sí funciona

- **Signup + onboarding completo** (tras fix). 4 pasos del wizard
  fluyen sin errores, redirect correcto a `/dashboard/user` al terminar.
- **Onboarding skip**: si el user no completa wizard, queda interceptado
  en `/onboarding`. Si lo completa, `profiles.onboarded_at` se setea.
- **Sidebar**: las 12 rutas del rol user cargan sin error:
  ✅ `clubes`, `eventos`, `ranking`, `chat`, `amigos`, `shop`, `academia`,
  `mis-clases`, `perfil`, `team`, `solicitar-club`, `ayuda`.
- **Badge counter dinámico** ("3 / 5") deriva del array `BADGES`
  (fix anterior verificado).
- **Sidebar item Ayuda** appendado correctamente para todos los roles,
  carga `HelpScreen` con contenido del rol user.

## 🧹 Cleanup secundario

Reemplazos masivos `acá → aquí` / `allá → allí` en **27 archivos** de
`src/` (UI strings que estaban en rioplatense). Typecheck pasa.

## Pendiente para el siguiente recorrido

- Inscripción a torneo end-to-end (necesita torneo publicado activo).
- Reservar cancha (necesita drawer funcional, hoy roto).
- Mi plan / upgrade (necesita el botón funcionando).
- Mensajes, amigos, shop, academia — cargar cada uno y validar widgets.
- Pasar a rol partner / owner / admin con el mismo recorrido.

## Resolución de bugs UI

| Bug | Fix |
|---|---|
| Quick Action / RESERVAR / ACTIVAR MATCHPOINT+ no abrían modal | `DashboardModals.tsx` refactorizado: ahora monta los modales eagerly en vez de lazy con `next/dynamic`. El lazy + event-dispatch creaba race condition donde el dispatch del padre corría antes de que el chunk del modal cargara y su listener interno se registrara. Eager mount: cero coste perceptible (los modales solo renderizan UI al recibir el evento). |
| Wizard paso 4 mostraba `intermediate` / `pickleball` raw | `OnboardingWizard.tsx`: mostrar `SPORTS.find(s => s.value === ...)?.label` y `SKILLS.find(...)?.label` en vez del valor crudo. |

## Limitación conocida de agent-browser

`npx agent-browser click @eN` y `npx agent-browser find role button click`
**no siempre disparan el `onClick` de React** en componentes con event
listeners sintéticos. El `Done` que devuelve no significa que el handler
corrió.

Para validar que un botón funciona desde agent-browser, usar `eval`:

```bash
npx agent-browser eval "var b=Array.from(document.querySelectorAll('button')).find(function(x){return x.textContent.trim()==='Reservar cancha'});b.click();JSON.stringify({clicked:true})"
```

`btn.click()` programático sí dispara el handler React. Funciona en cualquier
caso donde el CDP click falle.

## Cómo reproducir

```bash
# Asegurar dev server up
pnpm dev   # (o el equivalente)

# Crear test user via UI (signup en /)
# Ya creado: qa-user-2@matchpoint.test / QaTest1234!

# Abrir browser
npx agent-browser open http://localhost:3000
npx agent-browser snapshot   # ver refs disponibles
# ... interactuar via clicks/fill
npx agent-browser close
```
