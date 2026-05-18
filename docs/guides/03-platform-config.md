# Platform config

> Tabla key-value para parámetros de negocio que cambian sin redeploy. Si
> agregas una constante de negocio en código, **revisar primero** si debería
> ir aquí.

## 1. Tabla

`public.platform_config` (mig 080):

```sql
key text primary key,
value jsonb not null,
description text,
updated_at timestamptz default now(),
updated_by uuid references profiles(id)
```

RLS:
- SELECT solo admin (`platform_config_admin_read`)
- No hay policy de UPDATE/INSERT → mutación vía service role o SQL manual

## 2. Keys actuales

| Key | Default | Tipo | Consumido por |
|---|---|---|---|
| `take_rate_pct` | `10` | number | `AdminMetricsScreen`, `AdminPagosScreen` (cálculo de comisión) |
| `estelar_price_cents` | `2000` | number | (TODO) UI para mostrar costo de marcar torneo estelar |
| `refund_window_days` | `7` | number | T&C del partner, UI banner cancelación. (TODO: cron que crea recordatorios al partner) |

Defaults seedeados en `migrations/080_platform_config.sql`. Si la query
falla, los helpers también caen a estos defaults.

## 3. Helper

`src/server/queries/platform-config.ts`:

```ts
import { getTakeRatePct, getEstelarPriceCents, getRefundWindowDays }
  from "@/server/queries/platform-config";

const pct = await getTakeRatePct(); // 10
const price = await getEstelarPriceCents(); // 2000
```

**Características**:
- Cache in-memory con TTL **1 minuto** (cambios no son inmediatos pero
  evita N queries por request).
- Usa `getAdminClient()` internamente (RLS no deja al user leer).
- Si la row no existe en DB, retorna el default hardcoded.
- `getAllPlatformConfig()` para fetch combinado de todas las keys.

**Importar solo desde server** — el archivo lleva `import "server-only"`.

## 4. Cómo editar una key

Por ahora no hay UI dedicada. Vías:

### A. SQL directo (SQL console Supabase)
```sql
update public.platform_config
set value = '12'::jsonb,
    updated_at = now(),
    updated_by = '<tu uuid admin>'
where key = 'take_rate_pct';
```

El cambio surte efecto en máx 60 segundos (TTL del cache).

### B. (TODO) UI en /dashboard/admin/admin-config
Hoy `AdminConfigScreen` está stubed. Cuando se implemente, debería:
- Listar todas las keys con su descripción
- Permitir editar value (con validación según tipo esperado)
- Mostrar `updated_at` + `updated_by`
- Auditarse en `audit_log` con `p_action = 'platform_config.update'`

## 5. Cómo agregar una key nueva

1. **Decidir el nombre** — snake_case, descriptivo, incluir unidad si aplica
   (`*_cents`, `*_pct`, `*_days`, etc).

2. **Migration nueva** (idempotente):
```sql
insert into platform_config (key, value, description) values
  ('mi_nueva_key', '42'::jsonb, 'Descripción legible')
on conflict (key) do nothing;
```

3. **Update del helper** `src/server/queries/platform-config.ts`:
```ts
const DEFAULTS = {
  take_rate_pct: 10,
  estelar_price_cents: 2000,
  refund_window_days: 7,
  mi_nueva_key: 42, // ← agregar aquí
} as const;

export async function getMiNuevaKey(): Promise<number> {
  const all = await loadAll();
  return all.mi_nueva_key;
}
```

4. **Update de este doc** — agregar fila a §2.

5. **Si la consume el cliente**: la key vive server-only. Pasarla como prop
   desde Server Component a Client Component, **no** hacer fetch desde el
   cliente (RLS lo bloquea + es secret-ish).

## 6. ¿Qué va aquí y qué no?

### ✅ Va aquí
- Comisiones, take rates, precios fijos de features de la plataforma
- Ventanas de tiempo (refund window, cooldowns, expiry days)
- Umbrales globales (max upload size, max participants default)
- Switches que cambian comportamiento (`auto_capture_tournament_payments: true`)
- Sin necesidad de re-deploy, cambio inmediato (~1min)

### ❌ NO va aquí
- Feature flags por usuario/cohort → tabla `feature_flags` (existe, no usada
  en serio aún)
- Config per-rol o per-tenant → estado en la tabla de ese tenant
  (clubs/partner_orgs)
- Secrets / API keys → env vars
- Catálogos (kinds, roles) → tablas propias seedeadas
- Datos que muta el usuario → tablas de dominio

## 7. Cambios que sí requieren redeploy

Aún hay constantes que **deberían** estar aquí pero no están todavía. Lista
de "deuda" (cuando toques estos, considerá migrarlos):

| Constante actual | Archivo | Sugerido key |
|---|---|---|
| `DEFAULT_COMMISSION_PCT = 0.2` | `CoachPagosScreen.tsx` | `default_coach_commission_pct` |
| Curvas easing `cubic-bezier(...)` | `globals.css` | NO migrar (tokens visuales) |
| Scoring presets de pickleball | `CreateTournamentFlow.tsx` | NO migrar (tipos enum) |
| Cláusulas T&C del torneo | `CreateTournamentFlow.tsx` | Quizás (legal puede cambiar) |
| Default `max_participants` (32) | `CreateTournamentFlow.tsx` | `default_tournament_max_participants` |

## 8. Cache & consistencia

- TTL de 60s significa que **2 requests consecutivos pueden leer valores
  distintos** durante la transición. Aceptable para casos no-críticos.
- Si necesitas lectura fresh garantizada (raro), llamar
  `getAllPlatformConfig()` después de un timeout o reiniciar el server.
- El cache vive **per-process** (Next.js Server Components corren en
  procesos múltiples). No hay invalidación cross-process — cada uno expira
  cuando le toca.

## 9. TODOs

- [ ] UI admin para editar keys (`AdminConfigScreen`)
- [ ] Audit log cuando cambia una key
- [ ] Notif a admins cuando alguien edita keys críticas (take_rate, etc)
- [ ] Migrar `DEFAULT_COMMISSION_PCT` del coach
- [ ] Considerar mover cláusulas T&C del torneo (legal/compliance)
