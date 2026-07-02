-- 20260714010000 · Refresh condicional de mv_user_ranking.
--
-- El cron horario `refresh-mv-user-ranking` (mig 059) hacía REFRESH
-- MATERIALIZED VIEW CONCURRENTLY incondicional 24×/día aunque player_stats no
-- hubiera cambiado (audit de costos 2026-07-01). Ahora se guarda una marca de
-- agua (max updated_at + count de filas) y solo se refresca si algo cambió.

create table if not exists public.mv_refresh_state (
  view_name    text primary key,
  last_max     timestamptz,
  last_count   bigint,
  refreshed_at timestamptz
);

alter table public.mv_refresh_state enable row level security;
-- Sin policies: solo service role / SECURITY DEFINER escriben y leen.

create or replace function public.fn_refresh_mv_user_ranking()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max   timestamptz;
  v_count bigint;
  v_state record;
begin
  select max(updated_at), count(*) into v_max, v_count from player_stats;

  select * into v_state from mv_refresh_state where view_name = 'mv_user_ranking';
  if found
     and v_state.last_max is not distinct from v_max
     and v_state.last_count is not distinct from v_count then
    -- Nada cambió desde el último refresh — evitar el rebuild O(N).
    return;
  end if;

  refresh materialized view concurrently mv_user_ranking;

  insert into mv_refresh_state (view_name, last_max, last_count, refreshed_at)
  values ('mv_user_ranking', v_max, v_count, now())
  on conflict (view_name) do update
    set last_max = excluded.last_max,
        last_count = excluded.last_count,
        refreshed_at = excluded.refreshed_at;
end;
$$;

revoke all on function public.fn_refresh_mv_user_ranking() from public;
revoke execute on function public.fn_refresh_mv_user_ranking() from anon, authenticated;
grant execute on function public.fn_refresh_mv_user_ranking() to service_role;
