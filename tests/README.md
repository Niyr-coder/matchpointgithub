# Matriz de testing — MATCHPOINT

Cobertura por tipo de prueba, comandos y pre-requisitos.

## Pre-requisitos

1. `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Migraciones aplicadas en Supabase (local o preview — **no producción** para E2E/DB destructivos).
3. Dev server para smoke/integration/load/security:
   ```bash
   npm run dev
   ```
4. Primera vez E2E: `npm run test:e2e:install`

## Orquestador (recomendado)

| Comando | Qué ejecuta |
|---------|-------------|
| `npm run test:matrix` | Sanity + unit + DB + smoke + API + security + load |
| `npm run test:matrix:quick` | Solo sanity + unit (~1 min) |
| `npm run test:matrix:e2e` | Matriz completa + Playwright E2E |

Con dev server ya corriendo:
```bash
MATCHPOINT_E2E_REUSE_SERVER=1 npm run test:matrix
```

## Matriz por tipo

| Tipo | Suite | Comando | Ubicación |
|------|-------|---------|-----------|
| **Automated** | Orquestador | `npm run test:matrix` | `scripts/test-matrix.ts` |
| **Unit** | Motor torneos, scheduling, setup-lock | `npm run test:unit` | `tests/unit/` |
| **Smoke** | Rutas públicas HTML | `npm run test:smoke` | `tests/smoke/` |
| **Integration** | API REST + auth boundaries | `npm run test:integration` | `tests/integration/` |
| **Contract** | OpenAPI paths/schemas | `npm run test:contract` | `tests/contract/` |
| **E2E** | Flujos UI Playwright | `npm run test:e2e` | `tests/e2e/` |
| **Database** | Invariantes schema post-migración | `npm run test:db` | `tests/db/` |
| **Load** | 5 workers × 4 iter `/` | (incluido en matrix) | `tests/load/` |
| **Stress** | 25 concurrent `/clubes` | (incluido en matrix) | `tests/load/` |
| **Spike** | 40 burst `/eventos` | (incluido en matrix) | `tests/load/` |
| **Endurance (Soak)** | 3×10 iter `/ranking` | (incluido en matrix) | `tests/load/` |
| **Security** | 401 sin auth, admin bloqueado | `npm run test:security` | `tests/security/` |
| **Concurrency** | 20 GET paralelos `/api/v1/clubs` | (incluido en security) | `tests/security/` |
| **Resilience** | Métodos/path inválidos → no 500 | (incluido en security) | `tests/security/` |
| **Regression** | typecheck + openapi build | `npm run test:sanity` | `tests/regression/` |
| **Sanity** | Gates mínimos pre-deploy | `npm run test:sanity` | `tests/regression/` |

## Gates estáticos (CI manual hoy)

```bash
npm run typecheck
npm run lint
npm run build
npm run openapi:build
```

## E2E existente (Playwright)

| Spec | Cobertura |
|------|-----------|
| `crud-canchas.spec.ts` | CRUD canchas owner |
| `club-roles-*.spec.ts` | Permisos y flujos staff |
| `mat13-mp-plus-smoke.spec.ts` | MP+ smoke |
| `mat64-signup-smoke.spec.ts` | Signup + signin UI |
| `vista-publica.spec.ts` | Landing pública |
| `p3b-chat-unread-realtime.spec.ts` | Chat realtime |
| `*-mobile-responsive.spec.ts` | Layout móvil |

Reporte HTML: `tests/e2e/.artifacts/html-report/`

## Qué falta para producción enterprise

- **k6 / Artillery** para load real con métricas p99 bajo tráfico sostenido.
- **OWASP ZAP / nuclei** para security scanning automatizado.
- **Pact / Dredd** para contract contra consumidores externos.
- **CI GitHub Actions** ejecutando `test:matrix:quick` en cada PR y `test:matrix:e2e` nightly.
- **Unit tests** ampliados para server actions (mock Supabase).

## Hallazgos conocidos (última corrida local)

| Área | Resultado | Notas |
|------|-----------|-------|
| `npm run test:matrix` | **7/7 suites OK** | ~40s con dev server en `:3000` |
| `npm run test:e2e` | **15 passed / 8 failed** | 160 skipped por dependencias en cadena |
| `GET /api/v1/clubs` (list) | **Bug** | Devuelve 400 `VALIDATION.FAILED` slug aunque `page=1` |
| `GET /api/v1/admin/flags` sin auth | **Bug** | Devuelve 500 en lugar de 401/403 |

E2E fallidos típicos: signup smoke (`mat64`), mobile nav (`Navegación rápida`), club-roles-flows seed, MP+ reject queue, chat API oficial.

Reporte Playwright: `tests/e2e/.artifacts/html-report/`
