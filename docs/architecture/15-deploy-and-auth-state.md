# 15 · Estado actual de deploy y autenticación (snapshot 2026-05-24)

> Documento **forense**, no aspiracional. Captura lo que realmente está vivo en
> producción al 2026-05-24 y la divergencia con el repositorio. Cualquier
> decisión arquitectónica que toque `/login`, `/auth/*` o el pipeline de Vercel
> debe leer esto primero.

Issue tracker: [MAT-49](/MAT/issues/MAT-49) (sincronización repo ↔ deploy),
contexto adicional en [MAT-46](/MAT/issues/MAT-46), [MAT-47](/MAT/issues/MAT-47),
[MAT-48](/MAT/issues/MAT-48).

---

## 1. Divergencia repo ↔ producción

| Ruta              | `main` del repo                                                     | `www.matchpoint.top` (verificado live 2026-05-24)        |
| ----------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `/`               | landing nueva (Hero + secciones)                                    | landing (200, build distinto, mismo origen que `/login`) |
| `/login`          | server redirect → `/?auth=signin` (modal `AuthModal`)               | página propia split-screen con `LoginForm` client mount  |
| `/auth/callback`  | **no existe**                                                       | **404**                                                  |
| `/soy-coach`      | existe (commit `feca689`, hace <1 h)                                | **404**                                                  |
| `/precios`        | existe (commits MAT-20/25/30, <2 h)                                 | **404**                                                  |
| `/blog`           | existe (commits `bb4e377`, `6a0d79c`, <2 h)                         | **404**                                                  |
| OAuth Google      | botones renderizados con `disabled` + tooltip "Próximamente"        | único método visible en `/login` (no email/password)     |
| `signIn`/`signUp` | server actions con `supabase.auth.signInWithPassword` / `.signUp`   | no expuestos en UI; UI sólo lanza OAuth                  |
| Build pipeline    | sin `vercel.json`, sin `.github/workflows/`, sin acción auto-deploy | servida por Vercel CDN (`server: Vercel`)                |

Headers de producción capturados:

```
GET https://www.matchpoint.top/login
HTTP/2 200, x-vercel-cache: HIT, x-nextjs-prerender: 1, age: ~1 305 000s
build chunk URL: /_next/static/chunks/0-hrh_uw98wb_.js
Next build id (de la app shell): sWX35-LbOxrP7eO40k81u

GET https://www.matchpoint.top/auth/callback     → 404
GET https://www.matchpoint.top/soy-coach          → 404
GET https://www.matchpoint.top/precios            → 404
GET https://www.matchpoint.top/blog               → 404
```

`/soy-coach`, `/precios` y `/blog` se mergearon a `main` hace menos de dos horas
y siguen devolviendo 404 en producción → **el último deploy productivo no
vino del estado actual de `main`**.

## 2. Origen real del bundle productivo

No identificado dentro de este repositorio. Evidencia:

- Ningún commit en ninguna rama (`main`, `mat-22-soy-coach`, `mat-43-legal-lists`, …)
  contiene la cadena `LoginForm`, `GoogleSignInButton`, `signInWithOAuth`, ni
  un componente con la estructura split-screen vista en producción.
- El historial completo de `Niyr-coder/matchpointgithub` arranca el 2026-05-23
  (commit raíz `3fdba8f`). Producción ya servía `/login` Google-only antes de
  esa fecha (cache `age` ≈ 15 días).
- No hay `vercel.json` ni workflow de GitHub Actions; no hay rastro de un
  `vercel deploy` reproducible desde este repo.

Hipótesis abiertas (a confirmar con el board, único actor con acceso al
dashboard de Vercel):

1. **Deploy manual histórico:** alguien corrió `vercel deploy --prod` desde un
   checkout local que nunca llegó a GitHub. Ese código es la única fuente del
   `/login` Google-only.
2. **Proyecto Vercel apuntando a otro repo:** el dominio `www.matchpoint.top`
   está enlazado a un proyecto distinto (otra org o repo) que no compartimos.
3. **Auto-deploy roto/deshabilitado en este repo:** existe la conexión, pero
   las builds recientes nunca se promovieron a prod (el cache de 15 días lo
   hace plausible).

Sin acceso al dashboard de Vercel no podemos descartar (1)–(3). Ver §5.

## 3. Riesgo concreto

🔴 **Sólo persiste hasta que alguien confirme y, si aplica, repare el pipeline
de Vercel.**

- Si Vercel **está** auto-deployando este repo y el problema es que la build
  productiva quedó congelada → cualquier "deploy hook", `vercel --prod` desde
  un colaborador, o un nuevo push reabre la promoción y publica `main`
  inmediatamente. El producto regresa al estado pre-OAuth (`AuthModal` con
  Google deshabilitado, sin `/auth/callback`).
- Si Vercel **no** está conectado a este repo, el riesgo se traslada: cuando
  se conecte (o se haga el primer deploy "oficial" desde aquí) reemplazará el
  bundle Google-only sin posibilidad de revert porque la fuente productiva
  nunca estuvo versionada.

En ambos escenarios, el código del repo **no soporta el flujo OAuth** y la
documentación arquitectónica ([00-overview.md](./00-overview.md) §1) describe
un stack de auth que no existe ni en `main` ni en producción.

## 4. Estado deseado (lo que MAT-46/47/48 deben aterrizar)

Una vez el board defina el método de auth ([MAT-48](/MAT/issues/MAT-48)):

- `src/app/login/page.tsx` debe ser el `/login` real, no un redirect.
- `src/app/auth/callback/route.ts` (App Router) debe existir y usar
  `supabase.auth.exchangeCodeForSession` (ver bloque en [MAT-47](/MAT/issues/MAT-47)).
- Server action `signInWithGoogle` (o equivalente) debe vivir en
  `src/server/actions/auth.ts` junto a `signInFromForm`/`signUpFromForm` y
  llamar a `supabase.auth.signInWithOAuth({ provider: "google" })` con
  `redirectTo` apuntando a `${NEXT_PUBLIC_APP_URL}/auth/callback`.
- `AuthModal` debe activar el botón "Continuar con Google" (hoy `disabled`).
- El host de Supabase usado en cliente y servidor debe ser el de producción
  (ver [MAT-46](/MAT/issues/MAT-46)).
- Este documento debe actualizarse cuando se mergee el cambio.

## 5. Acciones obligatorias antes del próximo deploy a `main`

Una de las dos rutas debe ejecutarse:

**A. Rescatar la fuente productiva desde Vercel (preferido si existe).**

1. Board/CEO ejecuta `vercel pull` o descarga el código fuente del último
   deployment desde el dashboard del proyecto.
2. Se versiona en una rama (`recover/prod-login`) y se hace cherry-pick de
   `src/app/login/`, server action OAuth y `src/app/auth/callback/` a `main`.
3. Se confirma con `curl -sI` post-merge que `/login` y `/auth/callback` siguen
   respondiendo idéntico.

**B. Reconstruir Google-only desde cero (si A no es posible).**

1. CTO + Coder implementan `/login`, `signInWithGoogle` server action y
   `/auth/callback` siguiendo la spec de [MAT-47](/MAT/issues/MAT-47).
2. Antes del deploy productivo, se compara contra el HTML servido hoy para no
   regresar copies visibles (split-screen, "Juega más / Juega mejor", footer
   "© 2026 MATCHPOINT").
3. Validar con el board que es aceptable perder cualquier customización
   adicional que sólo viva en el bundle productivo.

Hasta que A o B se complete:

- **No promover ningún deploy productivo desde `main`.** Si el board necesita
  empujar features (blog, precios, soy-coach) a prod, hacerlo desde un branch
  que reincluya el código de `/login` Google-only.
- Mantener este documento como gating: cualquier PR que toque `src/app/login`,
  `src/app/auth`, `src/middleware*`, o `next.config.ts` redirige aquí en su
  descripción.

## 6. Bitácora

- 2026-05-24 — Snapshot inicial creado bajo MAT-49. Forense, sin cambios de
  código asociados al documento.
