# Tests E2E — MATCHPOINT

Verificación end-to-end con Playwright contra el dev server + Supabase real.
Cobertura inicial agregada por [MAT-8](/MAT/issues/MAT-8) para validar el DoD
del CRUD de canchas (W3 / MAT-6 / commits `7603fa5` + `ee49cd0`).

## Pre-requisitos

1. `.env.local` con:

   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

   Apuntando a Supabase **local** (Docker) o **preview** (proyecto separado de
   producción). NO usar el proyecto de producción — el helper de setup escribe
   contra `courts`, `court_pricing`, `clubs`, `auth.users`.

2. Migraciones `001..099` aplicadas en la DB (`supabase db reset` en local).

3. Primera vez:

   ```bash
   npm run test:e2e:install   # instala browser chromium para Playwright
   ```

## Ejecución

```bash
npm run test:e2e
```

El runner levanta `next dev` automáticamente (`webServer` en
`playwright.config.ts`). Si ya tienes uno corriendo, ejecuta con:

```bash
MATCHPOINT_E2E_REUSE_SERVER=1 npm run test:e2e
```

## Evidencia

- `tests/e2e/.artifacts/flow{1,2,3}-*.png` — screenshots de cada flujo.
- `tests/e2e/.artifacts/flow{1,2,3}-*-dump.json` — dumps SQL de las filas
  relevantes (`courts`, `court_pricing`, `court_blocks`).
- `tests/e2e/.artifacts/html-report/` — reporte HTML completo de Playwright.

## Estructura

```
tests/e2e/
├── helpers/
│   ├── env.ts          # Lectura de env vars con fail-fast claro.
│   ├── supabase.ts     # Service-role client (sólo helpers, no app).
│   ├── setup.ts        # ensureSeed() idempotente + dumpRows().
│   └── auth.ts         # signInAsOwner() via UI real.
├── crud-canchas.spec.ts  # 3 flujos del DoD MAT-8.
└── README.md
```

## Limpieza

El usuario seed E2E vive en `@matchpoint.demo` (mismo dominio que el seed
demo). `npm run seed:reset` borra todo lo que cuelga del dominio demo y
recrea el estado inicial.
