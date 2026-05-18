# RLS summary

> Cheat sheet operativo de RLS por tabla. Para la definición SQL completa
> ver `architecture/30-rls.md`. Acá: **qué puede hacer cada rol en cada
> tabla crítica**, con el client correcto a usar en código.

Tres clientes:
- **anon+cookie** = `getServerClient()` → RLS aplica
- **service role** = `getAdminClient()` → RLS bypass total
- **client browser** → `getBrowserClient()` → RLS aplica con el JWT del user

## 1. Tablas críticas

### `profiles`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT propio | ✅ | anon |
| SELECT ajeno | 🟠 deja pasar (todos los autenticados leen todo) | anon |
| UPDATE propio | ✅ | anon |
| UPDATE ajeno | ❌ | requiere admin |
| INSERT | ❌ (trigger lo crea al signup) | — |

**Fuga conocida**: `profiles_authn_select_limited` (mig 003) hace
`using (auth.uid() is not null)`. Cualquier user autenticado puede leer
todos los perfiles, incluso bio/ciudad. Ver `privacy/01-data-sharing.md`.

### `role_assignments`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT propias | ✅ | anon |
| SELECT ajenas | ❌ | admin via service role |
| INSERT/UPDATE | ❌ | admin only |

### `tournaments`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT (general) | público | anon |
| INSERT | partner_admin via service role | server actions |
| UPDATE | partner_admin via service role | server actions |
| DELETE | admin only | service role |

⚠️ El UPDATE via `getServerClient` del partner **falla silencioso** (no
hay policy que lo deje). Patrón correcto:

```ts
await requireTournamentEditor(tournamentId);
const admin = getAdminClient();
await admin.from("tournaments").update({ ... }).eq("id", id);
```

### `registrations`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT propias | ✅ | anon |
| SELECT del torneo (partner) | ✅ (`reg_partner_select`) | anon |
| INSERT propia | partner/admin via service role | server actions |
| UPDATE status (acept/rej) | partner/admin via service role | server actions |
| Self-withdraw | ✅ con WITH CHECK (mig 068) | anon |

### `transactions`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT propias customer | ✅ (`tx_customer_select`) | anon |
| SELECT staff del club | ✅ (`tx_staff_all`) | anon |
| INSERT (anon) | ❌ — solo staff o service role | service role |
| UPDATE | staff del club ✅, admin solo via service role | service role |
| Aprobar proof | admin via service role | server action |

⚠️ Customer no puede UPDATE su tx via anon. `submitPaymentProof` usa
admin client tras validar `tx.customer_user_id === uid`.

### `player_subscriptions`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT propias | ✅ | anon |
| INSERT propias | ✅ con `with check (user_id = auth.uid())` | anon |
| UPDATE | admin only | service role |
| DELETE | nadie | — |

`grantMatchPointPlusAdmin` y `revokeMatchPointPlusAdmin` usan admin client.

### `partner_members`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT propias | ✅ | anon |
| SELECT del partner (si soy admin del partner) | ✅ vía `mp_is_partner_admin_of` helper | anon |
| INSERT/UPDATE | admin del partner_org via helper SECURITY DEFINER | service role o anon con helper |

⚠️ **Recursión histórica fixed en mig 069** — la policy original tenía
`exists(select 1 from partner_members ...)` inline que recursaba infinito.
Reemplazada por helper SECURITY DEFINER.

### `notifications`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT propias | ✅ | anon |
| INSERT | ❌ — solo dispatcher (SECURITY DEFINER) | dispatcher cron |
| UPDATE read_at (mark as read) | ✅ | anon |
| DELETE | ❌ | nadie |

### `notification_jobs`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT | admin only | service role |
| INSERT | ❌ vía RLS — server actions usan service role | service role |
| UPDATE | dispatcher only (SECURITY DEFINER) | cron |

### `platform_config`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT | solo admin | anon (admin) o service role |
| INSERT/UPDATE | ❌ — manual o admin via service role | service role |

### `payouts`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT (admin) | ✅ todos los payouts | anon (admin) |
| SELECT (club staff) | ✅ los del club | anon |
| SELECT (partner admin) | ✅ los del partner | anon |
| INSERT/UPDATE | admin only | service role |

### `tournament_categories`, `tournament_schedule_blocks`, `tournament_prizes`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT | público | anon |
| INSERT/UPDATE/DELETE | admin via service role | server actions (después de `requireTournamentEditor`) |

### `coach_commissions`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT (el coach, staff del club, admin) | ✅ | anon |
| INSERT/UPDATE | admin only | service role |

### `audit_log`
| Operación | RLS | Cliente |
|---|---|---|
| SELECT | admin only | anon (admin) o service role |
| INSERT | ❌ vía RLS — escritura solo por trigger `tg_audit` (SECURITY DEFINER) | triggers |
| UPDATE/DELETE | ❌ inmutable | — |

## 2. Tablas con `using (true)` (público)

Lecturas abiertas a anon (sin filtro):

- `clubs` — listings públicos
- `courts` — públicos por club
- `tournament_categories` — públicos
- `tournament_schedule_blocks` — públicos
- `tournament_prizes` — públicos
- `brackets`, `bracket_matches` — públicos
- `coach_profiles` — públicos (catálogo)
- `product_categories` — público
- Views: `tournaments_public_summary`, `clubs_public_summary`,
  `v_public_profiles`

Si agregas algo a esta lista, **asegúrate** que no contenga datos
sensibles. El SELECT `(true)` es defensivo para landing pages.

## 3. Anti-patrones que ya rompieron cosas

### ❌ `getServerClient` para UPDATE en tablas restrictivas
```ts
// MAL: falla silencioso para customer
const supabase = await getServerClient();
await supabase.from("transactions").update({ status: "captured" })...
```
```ts
// BIEN
const userId = await requireUserId();
// ... validar ownership en código ...
const admin = getAdminClient();
await admin.from("transactions").update(...).eq("id", txId);
```

### ❌ Policy con `exists` recursivo
```sql
-- MAL: recursión infinita
create policy x on partner_members for all using (
  exists(select 1 from partner_members pm where pm.partner_id = partner_id
         and pm.user_id = auth.uid() and pm.role = 'admin')
);
```
```sql
-- BIEN: helper SECURITY DEFINER que evade RLS dentro
create policy x on partner_members for all
  using (mp_is_partner_admin_of(partner_id));
```

### ❌ Importar admin client desde "use client"
```ts
// MAL: bundle del cliente termina con service role exposed
"use client";
import { getAdminClient } from "@/lib/db/client.admin"; // ⚠️ ERROR DE BUILD
```
```ts
// BIEN: aislar en server-only module
// src/server/queries/algo.ts
import "server-only";
import { getAdminClient } from "@/lib/db/client.admin";
export async function loadAlgo() { ... }
```

## 4. Checklist al agregar una tabla nueva

1. `alter table ... enable row level security;`
2. Definir policies para los 4 verbs (SELECT/INSERT/UPDATE/DELETE) o
   documentar por qué no aplica.
3. Si el cliente la lee → considerar `using (true)` o policy específica
   por user/role.
4. Si el cliente la muta → server action con `require*` + service role.
5. Agregar fila a §1 de este doc + a `architecture/30-rls.md`.
6. Si entra al realtime publication → `architecture/50-realtime.md §15`.

## 5. Auditar manualmente

Para ver todas las policies de una tabla:

```sql
select polname, polcmd, pg_get_expr(polqual, polrelid) as using_clause,
       pg_get_expr(polwithcheck, polrelid) as check_clause
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname = '<tabla>';
```

Para listar tablas SIN RLS:

```sql
select c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;
```

## 6. TODOs

- [ ] Restringir `profiles_authn_select_limited` (fuga de datos
      personales — ver `privacy/01`)
- [ ] Audit log incluyendo lecturas críticas (hoy solo mutaciones)
- [ ] pgTAP tests para cada policy nueva (CI los corre)
