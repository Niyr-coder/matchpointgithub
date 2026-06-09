# Supabase Security Advisor · runbook

Checklist para bajar ERROR/WARN del advisor sin sorpresas en deploy.

## Migraciones automatizables (repo)

| Alerta | Fix en repo |
|--------|-------------|
| `_matchpoint_migrations` sin RLS | `20260609120000_supabase_rls_linter_fixes.sql` |
| Vistas SECURITY DEFINER | `20260610120000_security_views_rate_limit_hardening.sql` |
| `fn_rate_limit_consume` expuesto a anon | misma migración (solo `service_role`) |

## Manual (postgres en SQL Editor)

### `spatial_ref_sys` (PostGIS)

El owner es `supabase_admin`; las migraciones normales no pueden `ALTER TABLE`.

```bash
# Contenido: scripts/ops/apply-postgis-rls.sql
```

Ejecutar en **matchpointgithub** y **MatchPointAPP**.

## Auth (Dashboard)

- **Leaked password protection**: Auth → Providers → Email → Enable leaked password protection.

## Post-deploy

1. Security Advisor → 0 ERROR (excepto transient).
2. Smoke: signup, contact sales, landing torneos, sponsors.
3. `npx tsx --env-file=.env.local scripts/check-beta-readiness.ts`
