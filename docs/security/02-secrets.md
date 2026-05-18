# Secrets y env vars

> Las cosas que **NO** pueden filtrarse al cliente, dónde viven, cómo se
> protegen y qué pasa si se exponen.

## 1. Inventario de secrets

### Críticos (filtrarse = compromise total)

| Secret | Ubicación | Quién lo usa | Si se filtra |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`, Vercel env | `getAdminClient()` only | Atacante puede leer/escribir cualquier fila ignorando RLS |
| `SUPABASE_JWT_SECRET` | `.env.local` | Server actions internas | Atacante puede firmar JWTs y suplantar cualquier user |
| `CRON_SECRET` | `.env.local` | Cron handlers en `/api/cron/*` | Atacante puede triggear crons (dispatch emails, payouts) |

### Importantes
| Secret | Ubicación | Quién lo usa | Si se filtra |
|---|---|---|---|
| `RESEND_API_KEY` / SMTP creds | `.env.local` | Email dispatcher (cuando exista) | Atacante puede enviar emails desde tu dominio |
| `STORAGE_*` | derivados de Supabase | Storage signed URLs | Atacante puede subir archivos arbitrarios |

### Públicos (OK que estén en bundle cliente)

| Var | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Endpoint REST de Supabase del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (RLS aplica, no es secret) |
| `NEXT_PUBLIC_SITE_URL` | URL del sitio (para deep links) |

**Regla crítica**: NUNCA prefijar `NEXT_PUBLIC_` algo que no sea trivialmente
público. Next bundle a cualquier var con ese prefijo al cliente.

## 2. Cómo se protegen

### Service role key
- Solo importable desde `src/lib/db/client.admin.ts`.
- Ese archivo lleva **`import "server-only"`** al inicio. Si alguien
  intenta importarlo en un componente con `"use client"`, **el build
  falla**.
- Validado por audit reciente — no se filtra al bundle del browser.

```ts
// src/lib/db/client.admin.ts
import "server-only";  // 🔒 protección de build
import { createClient } from "@supabase/supabase-js";

export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

### Patrón para queries que necesitan admin
Si tu componente necesita data que requiere service role, **NO importes
`getAdminClient` directo desde el componente**. Aislar en server query:

```ts
// src/server/queries/mi-feature.ts
import "server-only";
import { getAdminClient } from "@/lib/db/client.admin";

export async function loadMiFeature(id: string) {
  const admin = getAdminClient();
  const { data } = await admin.from("mi_tabla").select("*").eq("id", id).single();
  return data;
}
```

```tsx
// src/components/.../MiFeature.tsx (server component)
import { loadMiFeature } from "@/server/queries/mi-feature";

export async function MiFeature({ id }) {
  const data = await loadMiFeature(id);
  return <MiFeatureClient data={data} />;
}
```

Patrón establecido por `src/server/queries/admin-applications.ts` (mig de
audit fix).

## 3. Env vars en cada ambiente

### Local dev (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=...
CRON_SECRET=local-dev-only
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Prod (Vercel)
- Service role key + JWT secret van en Vercel env vars con scope
  "Production" (no "Preview" público).
- `CRON_SECRET` único por proyecto — rotar si se sospecha leak.

### Test/staging
- Proyecto Supabase separado con datos no productivos.
- Service role key distinta a prod.

## 4. Validar que no hay leaks

### Auditar bundle cliente
```bash
pnpm build
# buscar el service role key en los chunks generados:
grep -r "service_role" .next/static/ || echo "✅ sin leaks"
```

Si grep encuentra algo, hay un import accidental — probablemente alguien
sacó el `import "server-only"` o creó un wrapper que filtra.

### Auditar vars públicas
```bash
grep -r "NEXT_PUBLIC_" src/ --include="*.ts" --include="*.tsx" | grep -v "test"
```

Solo deberían aparecer `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.

## 5. Storage (Supabase buckets)

Buckets configurados:
- `payment_proofs` — comprobantes de transferencia (privado, signed URLs 30min)
- `club_covers` — fotos de clubes (público, lectura libre)
- `avatars` — fotos de perfil (público, lectura libre)
- `kyc_docs` — documentos legales de aprobación de club (privado, solo admin)

**Patrón signed URL** (admin-only access):
```ts
const { data: signed } = await admin.storage
  .from("kyc_docs")
  .createSignedUrl(storagePath, 30 * 60); // 30 min TTL
return signed?.signedUrl;
```

**Reglas**:
- Privados → siempre signed URLs con TTL corto. NUNCA URL pública.
- Públicos → URL directa OK.
- Validar mime type + size en server antes de aceptar upload.

## 6. Cron handlers (`/api/cron/*`)

### Auth de crons
Patrón actual:
```ts
const auth = request.headers.get("authorization");
if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response("Unauthorized", { status: 401 });
}
```

**Limitación**: comparación de strings simple. Si `CRON_SECRET` se filtra,
atacante triggea el cron a voluntad.

**Mitigación pendiente** (TODO): HMAC-SHA256 sobre timestamp + payload, al
estilo GitHub webhook. Rotación periódica del secret.

### Crons activos
| Endpoint | Schedule | Llama |
|---|---|---|
| `/api/cron/dispatch-email` | (no activo) | email dispatcher cuando exista |
| `fn_dispatch_inapp_notifications` (SQL) | every 5min | dispatcher inapp |
| `notify-expiring-plans` (SQL) | daily | encola `plan_expiring_soon` |
| `cleanup-expired-plans` (SQL) | every 6h | downgrade subs vencidas |

Los SQL crons usan `pg_cron` (extensión Supabase), no requieren HTTP auth.
Solo importan los handlers HTTP.

## 7. Rotación

### Cuándo rotar
- Sospecha de leak (commit accidental, screenshot público, etc).
- Empleado que tenía acceso se va.
- Periódicamente (cada 90 días) para `CRON_SECRET`.

### Cómo rotar
1. **Service role key**: Supabase dashboard → Settings → API → regenerar.
   Actualizar en Vercel env. Re-deploy.
2. **CRON_SECRET**: cambiar valor en Vercel env. Re-deploy. (Si rotás sin
   reschedule, el cron viejo da 401 hasta que el cron service use el nuevo).
3. **JWT secret**: invalida TODAS las sesiones activas. Comunicar a users.

## 8. Logging seguro

**NO loguear**:
- Tokens JWT, refresh tokens
- Service role key, API keys
- Passwords (Supabase nunca los expone igual)
- Comprobantes de pago (URLs sí, contenido no)
- PII completa: emails OK en debug local, NO en prod logs

**OK loguear**:
- user_id (es UUID, no es PII directa)
- Tipo de error + endpoint
- IDs de recursos

### Console.log en cliente
Borrar antes de prod. Pattern reciente: `TopBar.tsx` tenía `console.log`
con uid + payloads de realtime — sacados.

## 9. Audit + monitoring

- Audit log de DB (`audit_log`) — ver `03-audit-log.md`.
- Supabase Dashboard → Auth → ver intentos de login, sign-ups recientes.
- Vercel Logs → response times, errores 5xx, abuse patterns.

## 10. Checklist al manejar secrets

- [ ] ¿La var es realmente pública? Si dudás → NO `NEXT_PUBLIC_*`.
- [ ] ¿El módulo que la usa tiene `import "server-only"`?
- [ ] ¿El bundle cliente está limpio? (grep en `.next/static/`)
- [ ] ¿La env var está en Vercel + `.env.local` + ignorada en git?
- [ ] Si rotás, ¿actualizaste todas las copias?

## 11. TODOs

- [ ] HMAC en cron secret
- [ ] Penetration test profesional
- [ ] Secret scanning en CI (Trufflehog, Gitleaks)
- [ ] Rotation policy formal (cada 90d)
- [ ] CSP headers + Subresource Integrity
- [ ] Vault interno o doppler/1password para creds compartidas del equipo
