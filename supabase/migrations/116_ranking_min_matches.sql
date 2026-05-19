-- 116 · Threshold mínimo de partidos para aparecer en /ranking.
-- Patrón: platform_config + RPC SECURITY DEFINER para que cualquier auth
-- pueda leer el valor sin pegar a la tabla directa (la RLS de
-- platform_config solo permite admin write/read).
--
-- Default 3: jugadores recién registrados con 0-2 partidos NO aparecen en
-- el leaderboard, evitando ruido y haciendo el ranking más significativo.
-- Admin puede ajustar sin redeploy: update platform_config set value=...

insert into public.platform_config (key, value, description)
values (
  'ranking_min_matches',
  '3'::jsonb,
  'Mínimo de partidos jugados para aparecer en el ranking público. Default 3.'
)
on conflict (key) do nothing;

create or replace function public.fn_get_ranking_min_matches()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((value)::text::int, 3)
  from public.platform_config
  where key = 'ranking_min_matches';
$$;

grant execute on function public.fn_get_ranking_min_matches() to authenticated, anon;
