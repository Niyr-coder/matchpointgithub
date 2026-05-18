-- 059 · Refresh periódico de mv_user_ranking.
--
-- mv_user_ranking se definió en 019_ranking.sql y la consume UserHome (lectura
-- del rank por usuario). Hasta ahora nada la refrescaba, así que el rank
-- mostrado podía quedar desactualizado indefinidamente respecto de
-- player_stats. Esta migration programa un cron horario que la refresca con
-- CONCURRENTLY (no bloquea lecturas).
--
-- La MV ya tiene un unique index `(user_id, sport)` declarado en 019, que es
-- requisito de REFRESH MATERIALIZED VIEW CONCURRENTLY. Si por alguna razón no
-- estuviera, el DO block usa fallback a refresh no-concurrente.
--
-- Cadencia: cada hora, en el minuto 7. El offset evita chocar con:
--   * 056 club_featuring         → 09:00 UTC diario
--   * 049 player_plans           → 08:00 UTC diario
--   * 050 inapp dispatch         → cada 5 minutos en el minuto 0
--
-- Idempotente: unschedule previo antes de re-schedule.
--
-- Depende de:
--   * pg_cron habilitado (049).
--   * mv_user_ranking existente con unique index (019).

-- Sanity check: si la MV no existe (rollback parcial de 019), abortamos con
-- un mensaje claro en vez de programar un cron que falla en cada tick.
do $$
begin
  if not exists (
    select 1
      from pg_matviews
     where schemaname = 'public'
       and matviewname = 'mv_user_ranking'
  ) then
    raise exception 'mv_user_ranking no existe; revisar migration 019 antes de aplicar 059';
  end if;
end $$;

-- Detecta si hay unique index sobre la MV (requisito de CONCURRENTLY) y elige
-- el comando apropiado. Lo programamos como wrapper para que el cron siempre
-- ejecute la sentencia correcta aunque el índice se cree/borre después.
create or replace function public.fn_refresh_mv_user_ranking()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _has_unique boolean;
begin
  select exists (
    select 1
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'mv_user_ranking'
       and i.indisunique
  ) into _has_unique;

  if _has_unique then
    execute 'refresh materialized view concurrently public.mv_user_ranking';
  else
    -- Fallback: refresh no-concurrente. Toma un AccessExclusiveLock breve
    -- pero garantiza que igual se actualice el rank.
    execute 'refresh materialized view public.mv_user_ranking';
  end if;
end;
$$;

revoke all on function public.fn_refresh_mv_user_ranking() from public;
grant execute on function public.fn_refresh_mv_user_ranking() to service_role;

-- Cron horario al minuto 7. Idempotente: unschedule antes de programar.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-mv-user-ranking') then
    perform cron.unschedule('refresh-mv-user-ranking');
  end if;

  perform cron.schedule(
    'refresh-mv-user-ranking',
    '7 * * * *',
    $cron$ select public.fn_refresh_mv_user_ranking() $cron$
  );
end $$;
