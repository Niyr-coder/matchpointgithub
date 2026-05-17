# 60 · OpenAPI & API Docs

> Una sola fuente de verdad: **Zod**. Los mismos schemas que validan inputs/outputs en runtime generan la spec OpenAPI 3.1, que renderiza **Scalar UI** en `/docs`.

---

## 1. Stack

| Pieza | Paquete | Rol |
|---|---|---|
| Validación + tipos | `zod@^3` | Schemas de dominio en `src/lib/schemas/` |
| Zod → OpenAPI | `@asteasolutions/zod-to-openapi` | Anota schemas con `.openapi()`, registra paths, emite `OpenAPIObject` |
| Generación de la spec | `tsx scripts/build-openapi.ts` → `public/openapi.json` | Corre en build y en pre-commit hook |
| UI documentación | `@scalar/api-reference-react` o el script tag de Scalar CDN | Renderiza `/docs` |
| Cliente generado (opcional) | `openapi-typescript` | Para SDK externo o E2E tests |

---

## 2. Anatomía de un schema "OpenAPI-aware"

```ts
// src/lib/schemas/reservations.ts
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
extendZodWithOpenApi(z);

import { ClubIdSchema, UserIdSchema, IsoDateTimeSchema } from './common';

export const ReservationStatusSchema = z
  .enum(['booked','confirmed','checked_in','no_show','cancelled','completed'])
  .openapi('ReservationStatus');

export const ReservationSchema = z.object({
  id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
  clubId: ClubIdSchema,
  courtId: z.string().uuid(),
  during: z.object({
    start: IsoDateTimeSchema,
    end: IsoDateTimeSchema,
  }),
  status: ReservationStatusSchema,
  sport: z.enum(['tennis','padel','pickleball']),
  visibility: z.enum(['public','members','private']).default('private'),
  maxPlayers: z.number().int().min(2).max(8).default(4),
  organizerId: UserIdSchema,
  notes: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  cancelledAt: IsoDateTimeSchema.nullable(),
}).openapi('Reservation');

export const ReservationCreateSchema = ReservationSchema
  .pick({ clubId: true, courtId: true, sport: true, maxPlayers: true, visibility: true, notes: true })
  .extend({
    during: ReservationSchema.shape.during,
    idempotencyKey: z.string().uuid().optional(),
  })
  .openapi('ReservationCreate');

export type Reservation = z.infer<typeof ReservationSchema>;
export type ReservationCreate = z.infer<typeof ReservationCreateSchema>;
```

Reglas:
- **Cada schema "público"** lleva `.openapi('Name')` con un nombre PascalCase que se vuelve `$ref` reutilizable.
- **Inputs** acaban en `CreateSchema` / `UpdateSchema` / `ListParamsSchema`.
- **Outputs** son el schema base o un wrap con relations (`ReservationDetailSchema` etc.).
- `IsoDateTimeSchema`, `ClubIdSchema`, etc. viven en `src/lib/schemas/common.ts` y se reusan en todos los dominios.

---

## 3. Registro de rutas

```ts
// src/lib/api/openapi/registry.ts
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { ReservationSchema, ReservationCreateSchema } from '@/lib/schemas/reservations';
import { ApiOkSchema, ApiErrSchema, PageMetaSchema } from '@/lib/schemas/envelope';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/reservations',
  tags: ['Reservations'],
  security: [{ bearerAuth: [] }],
  summary: 'Create a reservation',
  description: 'Books a court slot. Returns 409 if slot just taken.',
  request: {
    headers: z.object({
      'Idempotency-Key': z.string().uuid().optional(),
      'X-Active-Role': z.enum(['user','owner','manager','employee']).optional(),
    }),
    body: { content: { 'application/json': { schema: ReservationCreateSchema } } },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: ApiOkSchema(ReservationSchema) } } },
    400: { description: 'Validation', content: { 'application/json': { schema: ApiErrSchema } } },
    409: { description: 'Slot taken', content: { 'application/json': { schema: ApiErrSchema } } },
  },
});
```

Cada Route Handler se acompaña de su `registry.registerPath(...)`. Por convención, el registro vive **al lado** del handler:

```
src/app/api/v1/reservations/
  route.ts         # GET + POST handlers
  route.openapi.ts # registry.registerPath(...) × 2
```

Un script de arranque importa todos los `*.openapi.ts` para forzar el registro:

```ts
// scripts/load-openapi-routes.ts (glob import)
import.meta.glob('../src/app/api/**/route.openapi.ts', { eager: true });
```

---

## 4. Helpers `ApiOkSchema` / `ApiErrSchema`

```ts
// src/lib/schemas/envelope.ts
export const ApiErrSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.array(z.string())).optional(),
    requestId: z.string(),
  }),
}).openapi('ApiError');

export const PageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
}).openapi('PageMeta');

export const ApiOkSchema = <T extends z.ZodTypeAny>(data: T) => z.object({
  ok: z.literal(true),
  data,
  meta: PageMetaSchema.optional(),
});  // no .openapi() porque es genérico; el ref viene del data
```

---

## 5. Script de build

```ts
// scripts/build-openapi.ts
import 'tsx';
import { writeFileSync, mkdirSync } from 'fs';
import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/lib/api/openapi/registry';
import './load-openapi-routes';

const generator = new OpenApiGeneratorV31(registry.definitions);
const document = generator.generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'MatchPoint API',
    version: process.env.npm_package_version ?? '0.1.0',
    description: 'Pickleball / Tennis / Padel platform — internal + external API.',
    contact: { name: 'MatchPoint', url: 'https://matchpoint.app' },
  },
  servers: [
    { url: 'https://app.matchpoint.dev', description: 'Production' },
    { url: 'https://staging.matchpoint.dev', description: 'Staging' },
    { url: 'http://localhost:3000', description: 'Local' },
  ],
  tags: [
    { name: 'Auth' }, { name: 'Profile' },
    { name: 'Clubs' }, { name: 'ClubApplications' },
    { name: 'Courts' }, { name: 'Reservations' }, { name: 'CheckIns' },
    { name: 'Cash' }, { name: 'ProShop' },
    { name: 'Coaches' }, { name: 'Classes' }, { name: 'Students' }, { name: 'Resources' },
    { name: 'Messaging' }, { name: 'Friends' }, { name: 'Teams' },
    { name: 'Ranking' }, { name: 'Tournaments' }, { name: 'Events' },
    { name: 'Notifications' }, { name: 'Broadcasts' },
    { name: 'Moderation' }, { name: 'Support' }, { name: 'FeatureFlags' }, { name: 'Partners' },
    { name: 'Webhooks' },
  ],
});

mkdirSync('public', { recursive: true });
writeFileSync('public/openapi.json', JSON.stringify(document, null, 2));
console.log('✓ openapi.json written (' + Object.keys(document.paths ?? {}).length + ' paths)');
```

Run: `pnpm openapi:build` (script en `package.json`).

---

## 6. UI Scalar en `/docs`

```tsx
// src/app/docs/page.tsx
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';

export default function DocsPage() {
  return (
    <ApiReferenceReact
      configuration={{
        spec: { url: '/openapi.json' },
        theme: 'default',
        layout: 'modern',
        hideClientButton: false,
        defaultHttpClient: { targetKey: 'javascript', clientKey: 'fetch' },
        metaData: { title: 'MatchPoint API Docs' },
        authentication: {
          preferredSecurityScheme: 'bearerAuth',
          http: { bearer: { token: '' } },
        },
      }}
    />
  );
}
```

`public/openapi.json` es estático, servido directo por Next. No expone secretos.

**Acceso:** abierto en local/staging; en prod restringido a usuarios con rol `admin` o detrás de basic-auth (configurable por env `MP_DOCS_PUBLIC=false`).

---

## 7. Pipeline CI

```yaml
# .github/workflows/openapi.yml
- run: pnpm openapi:build
- run: pnpm openapi:diff  # compara public/openapi.json con main
- run: git diff --exit-code public/openapi.json
  # fail si alguien tocó schemas sin regenerar la spec
```

**`pnpm openapi:diff`** usa `oasdiff` para detectar breaking changes y postear comentario en el PR.

---

## 8. Cliente generado (opcional pero gratis)

```bash
pnpm openapi:types     # genera src/lib/api/types.ts con `paths` y `operations`
```

Permite que un consumidor externo (mobile app futura, integraciones) tenga tipos sin reimportar nuestros Zod. Usa `openapi-typescript`:

```ts
import type { paths } from '@/lib/api/types';
type CreateReservationBody = paths['/api/v1/reservations']['post']['requestBody']['content']['application/json'];
```

---

## 9. Convenciones de OpenAPI

| Cosa | Convención |
|---|---|
| **operationId** | `<verb><Resource>` — `createReservation`, `listReservations`. Generado por defecto de `method + path`. |
| **tags** | Uno por dominio (PascalCase). 1 endpoint = 1 tag. |
| **examples** | Cada schema con `.openapi({ example: ... })` en al menos los campos clave. Scalar los renderiza nice. |
| **deprecations** | `registry.registerPath({ ..., deprecated: true, description: 'use /v2/... since 2026-12' })` |
| **versionado** | Path lleva `/v1`. `/v2` será spec separada hasta que `/v1` se retire. |
| **errores comunes** | Definidos una vez como `ApiErrSchema` reusable; cada path lista los códigos que puede tirar en la `description` del 4xx/5xx. |

---

## 10. Mapping Server Actions ↔ OpenAPI

Las Server Actions **no son endpoints HTTP**, pero su contrato sí se documenta. Solución:

1. Para cada Server Action que **también** se expone como REST, el OpenAPI lo cubre vía el path REST.
2. Para Server Actions que **solo** se usan internamente (raro, casi todas tienen wrap REST), generamos un doc Markdown adicional `docs/server-actions.md` autogenerado por:

```ts
// scripts/build-server-actions-md.ts
// lee src/server/actions/*.ts, parsea las exports y sus tipos Zod
// emite tabla Markdown
```

Mantiene a los engineers internos honestos sin contaminar OpenAPI con actions que no son red-facing.

---

## 11. Versionado de la spec

`info.version` = `package.json` version (semver).

- **Patch** (`0.0.x`): solo bug fixes/docs.
- **Minor** (`0.x.0`): endpoints o campos **aditivos**.
- **Major** (`x.0.0`): breaking changes → simultáneo a publicar `/v2`.

`oasdiff` valida en CI que un PR no introduzca breaking sin bumpear major.

---

## 12. Documentación human-readable que complementa OpenAPI

OpenAPI cubre el **qué/cómo** de cada endpoint. Lo que no cubre bien:

| Tema | Dónde vive |
|---|---|
| Flujo entero (login → reservar → pagar) | `docs/guides/booking-flow.md` (Markdown, indexado por Scalar como tab "Guides") |
| Webhooks (firma, retries, payloads) | `docs/guides/webhooks.md` |
| Realtime channels (ya cubierto) | `docs/architecture/50-realtime.md` linkeado desde la UI |
| Errores: tabla completa de códigos | `docs/guides/error-codes.md` |
| Idempotencia | `docs/guides/idempotency.md` |

Scalar soporta `x-tagGroups` para agrupar tags en secciones (`Core`, `Tenant`, `Community`, `Ops`) — lo configuramos en el generator.

---

## 13. Checklist al crear un endpoint nuevo

1. Definir Zod schemas (input + output) en `src/lib/schemas/<dominio>.ts` con `.openapi('Name')`.
2. Implementar el handler en `src/app/api/v1/<...>/route.ts`.
3. Crear `route.openapi.ts` con `registry.registerPath(...)`.
4. (Si aplica) crear Server Action espejo en `src/server/actions/<dominio>.ts`.
5. Correr `pnpm openapi:build` localmente; commitear `public/openapi.json`.
6. Test: smoke con `fetch` + tipos generados; e2e Playwright si hay flujo cliente.
7. Si es público, agregar al guide correspondiente.

---

## 14. Próximos pasos (Fase 2)

Con Fase 1 cerrada, la implementación procede en este orden:

1. **Setup base:** Supabase proyecto + env + 4 clientes (`server`/`browser`/`admin`/`route`) + middleware.
2. **Migraciones SQL** (orden topológico de `10-domains.md` §dependencias).
3. **Zod schemas + Helpers** (`common.ts`, `envelope.ts`).
4. **Auth (signUp/signIn/switchRole)** + middleware con `set_local_context`.
5. **Dominios verticales** en este orden: identity → clubs/applications → courts → reservations → checkins → cash → proshop → coaches → classes → students → resources → messaging → friends → teams → ranking → tournaments → events → notifications → marketing → moderation → support → feature-flags → partners.
6. **Realtime hooks** después de cada dominio que lo necesita.
7. **OpenAPI build + Scalar UI** ya queda funcionando solo (auto-registra mientras se agregan paths).
8. **Seeders** con la misma data que los mocks de pantallas (para que /dashboard luzca igual con datos reales).

---

## Fase 1 cerrada

| # | Doc | Estado |
|---|---|---|
| 00 | overview | ✅ |
| 10 | domains | ✅ |
| 20 | database (incl. sub-dominio club-applications) | ✅ |
| 30 | rls | ✅ |
| 40 | api | ✅ |
| 50 | realtime | ✅ |
| 60 | openapi | ✅ |

Listos para Fase 2.
