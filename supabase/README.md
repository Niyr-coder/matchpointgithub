# Supabase

Migrations, edge functions and pgTAP tests for MatchPoint.

## Local dev

```bash
# requires: brew install supabase/tap/supabase   (or scoop on Windows)
supabase start            # boots local Postgres + studio + storage on :54321
supabase db reset         # re-runs all migrations + seed
supabase db diff -f X     # diff current schema vs migrations dir
supabase test db          # runs pgTAP suite in supabase/tests/
```

## Layout

```
migrations/   ordered SQL files run top to bottom on every db reset
tests/        pgTAP files covering RLS policies and triggers
seed.sql      demo data matching the dashboard mocks (added in Fase 2 step 8)
```

Migration files are immutable once merged to main — fixes go in a follow-up
migration, never edit a past one.

## Estado operativo de migraciones

Al 2026-05-30, el proyecto remoto de Supabase tiene historial de migraciones
desalineado con `supabase/migrations`: varias migraciones locales numeradas
fueron aplicadas en remoto con versiones timestamp, y también existen cambios
manuales puntuales. No ejecutes `supabase db push` general ni `migration repair`
masivo hasta completar un baseline explícito local/remoto.

Antes de desplegar cambios de schema:

1. Compara `supabase migration list` contra los archivos locales.
2. Identifica equivalencias por nombre/contenido, no solo por número.
3. Aplica únicamente migraciones follow-up idempotentes y acotadas.
4. Documenta cualquier SQL aplicado manualmente antes de reparar historial.

See `docs/architecture/20-database.md` for the full schema reference and
`30-rls.md` for the RLS policy matrix.
