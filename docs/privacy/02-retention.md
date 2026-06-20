# Retención y eliminación de datos

> Política de cuánto guardamos, qué pasa al borrar (soft vs hard) y qué
> ocurre cuando un user pide cerrar su cuenta. Alineado con `/legal/privacidad`
> y la UI en Mi perfil → Privacidad.

## 1. Patrones de delete por tabla

| Tabla | Delete pattern | Razón |
|---|---|---|
| `auth.users` | hard delete (cascade) | Supabase Auth — al borrar user, cascade a profiles, role_assignments, etc |
| `profiles` | cascade desde `auth.users` | unique 1:1 con auth |
| `role_assignments` | **soft delete** (`revoked_at`) | Histórico de "quién fue admin/owner cuándo" para auditoría |
| `tournaments` | **soft via `status='cancelled'`** + cascade futuro | Mantener historial de torneos completados |
| `registrations` | **soft via `status='withdrawn'`** | Histórico de inscripciones |
| `transactions` | hard (no se borra) | Compliance financiera |
| `refunds` | hard (no se borra) | Compliance financiera |
| `payouts` | hard (no se borra) | Compliance financiera |
| `messages` | hard delete (`deleted_at` marker) | Privacidad — el user puede borrar sus mensajes |
| `notifications` | hard delete por user | El user puede borrarlas individualmente |
| `notification_jobs` | hard delete tras procesar | Cola, no histórico |
| `audit_log` | append-only, **NUNCA delete** | Compliance + auditoría |
| `club_applications` | rejected → soft (queda histórico); approved → cascade a `clubs` | Auditoría |
| `clubs` | **soft via `status='suspended'`** | Histórico |
| `player_subscriptions` | soft via `status='cancelled'/'expired'` | Histórico de pagos |
| Storage `payment_proofs` | hard delete cuando tx pasa a `captured` o `pending_proof` (rejected) | Privacidad — no guardar comprobantes aprobados forever |
| Storage `kyc_docs` | hard delete N años post-rechazo/aprobación (TODO) | Privacidad + compliance |

## 2. Soft delete: ventaja y trampa

**Ventaja**: el row sigue en DB, podemos rehidratarlo, mantener integridad
referencial (otras tablas que lo FK siguen funcionando), auditar.

**Trampa**: si la query no filtra por `status` o `revoked_at IS NULL`,
te muestra rows "borrados" como si estuvieran activos.

**Patrón canónico**:
```ts
// SIEMPRE filtrar
await supabase.from("role_assignments")
  .select("*")
  .eq("user_id", uid)
  .is("revoked_at", null);  // ← crítico
```

**Bug histórico**: queries que olvidaron `revoked_at IS NULL` mostraban
roles ya revocados. Si tocás algo de roles, **doble-checkear** que el
filtro está.

## 3. Cron de cleanup

| Cron | Schedule | Qué hace |
|---|---|---|
| `cleanup-expired-plans` | every 6h | Downgrade profiles cuyo `plan_expires_at < now()` y marca subs como `expired` |
| `dispatch-inapp-notifications` | every 5min | Procesa `notification_jobs` pending y los mueve a `notifications` |
| (TODO) `cleanup-old-notif-jobs` | daily | Borrar jobs sent + 30d |
| (TODO) `cleanup-old-payment-proofs` | daily | Borrar archivos Storage de tx captured + 90d |

## 4. Qué pasa al cerrar cuenta

**Implementado** en Mi perfil → Privacidad (`AccountPrivacyPanel`) y server actions
`requestAccountClosure` / `cancelAccountClosure`.

```
[User en /dashboard/user/perfil → Privacidad → "Cerrar mi cuenta"]
   │
   ▼
[Modal confirma + escribe @username]
   │
   ▼
< requestAccountClosure({ confirmUsername, reason? }) >
   │
   ├── profiles.scheduled_deletion_at = now() + 30 days
   ├── revoke todas role_assignments
   ├── cancel player_subscriptions activas/pending
   └── audit vía setAuditActor(user)
        │
        ▼
[Cron diario /api/cron/process-account-deletions]
   │
   ├── transactions.customer_user_id → null
   ├── auth.admin.deleteUser() → cascade profiles, etc
   └── matches/registrations → quedan (histórico); perfil borrado
```

**Bloqueos**:
- Owner de club `active`/`pending` debe transferir propiedad antes.

**Decisión pendiente**:
- ¿Anonimizar display_name en matches públicos antes del delete? Hoy cascade borra profile.

## 5. GDPR / ley Ecuador (LOPDP)

Ecuador tiene Ley Orgánica de Protección de Datos Personales (LOPDP)
desde 2021. Aplica si guardamos datos de personas en Ecuador.

### Derechos a soportar
- **Acceso / portabilidad**: `GET /api/v1/me/export` + botón en perfil ✅
- **Rectificación**: editar perfil en preferencias ✅
- **Cancelación**: `POST /api/v1/me/close-account` + UI en perfil ✅
- **Oposición**: opt-out de procesamientos no esenciales (ranking público,
  notifs de marketing) — parcial vía preferencias de notif.
- **Portabilidad**: JSON vía export ✅

### Endpoints
- `GET /api/v1/me/export` — JSON con datos del titular ✅
- `POST /api/v1/me/close-account` — programar eliminación ✅
- `DELETE /api/v1/me/close-account` — cancelar cierre programado ✅
- `POST /api/me/object-to-ranking` — opt-out ranking público (TODO)

## 6. Backups

- Supabase hace **point-in-time recovery** (PITR) según el plan del proyecto.
- Backups encriptados, retención según tier (free 7d, paid 30d, etc).
- Si borrás un user y el backup se restaura, el user **vuelve** —
  considerar al implementar GDPR endpoints (re-aplicar deletions tras
  restore).

## 7. Retention por categoría de dato

| Categoría | Retención propuesta |
|---|---|
| Datos de cuenta activa | indefinida mientras esté activa |
| Datos post-cierre de cuenta | 30 días para reactivación, luego delete |
| Mensajes | mientras la cuenta exista (deleted_at marker al borrar individual) |
| Audit log | indefinida (compliance) |
| Logs Vercel/Supabase | según tier (~30d) |
| Comprobantes de pago aprobados | 90d post-aprobación (TODO cron) |
| Comprobantes de pago rechazados | hard delete inmediato al rechazar |
| KYC docs aprobados | 5 años (compliance financiera EC) |
| KYC docs rechazados | 1 año |
| Transactions captured/refunded | indefinida (compliance) |
| Payouts | indefinida (compliance) |

## 8. Anti-patrones

1. **Hard-delete sin pensar** — siempre considerar si hay integridad
   referencial que romper.
2. **Soft-delete sin filter** — bug clásico. Siempre `IS NULL` en queries.
3. **Borrar datos financieros** — nunca. Compliance.
4. **Borrar audit log** — nunca. Es la única defensa en disputas.

## 9. Reglas para devs

1. Si vas a hacer `delete()` en SQL/server action, pregúntate:
   - ¿Compliance lo permite?
   - ¿Hay FK que necesitan cascade?
   - ¿Soft delete es mejor?

2. Si agregas un campo "personal", documentar la **retención esperada**
   en `00-data-collection.md`.

3. Si agregas un cron de cleanup, agregarlo a §3 de este doc.

4. Antes de hard-deletar algo del user (al cerrar cuenta), **pasar por
   audit_log primero**.

## 10. TODOs

- [x] UI cerrar cuenta + flow 30d
- [x] Endpoints LOPDP (export, close, cancel close)
- [ ] Cron de cleanup `notification_jobs` viejos
- [ ] Cron de cleanup `payment_proofs` aprobados >90d
- [ ] Política pública en `/privacy` con retenciones explícitas
- [ ] Re-aplicar deletions post-restore de backup (workflow)
- [ ] Anonimización vs deletion para matches/registrations
