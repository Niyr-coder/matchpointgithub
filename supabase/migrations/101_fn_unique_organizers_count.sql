-- 101 · fn_unique_organizers_count
-- Reemplaza un patrón caro del layout dashboard owner/manager: hoy se hace
-- `select organizer_id, count: exact, head: false` que TRAE todas las filas
-- de reservations del club para luego sacar el distinct en memoria. En clubs
-- con miles de reservas históricas eso es lento por navegación al dashboard.
--
-- Security INVOKER: la RLS de reservations ya restringe owner/manager al
-- propio club. Si el caller no tiene visibilidad, devuelve 0.

create or replace function fn_unique_organizers_count(p_club_id uuid)
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select count(distinct organizer_id)::int
  from reservations
  where club_id = p_club_id
    and organizer_id is not null;
$$;

grant execute on function fn_unique_organizers_count(uuid) to authenticated;

comment on function fn_unique_organizers_count(uuid) is
  'Devuelve clientes únicos (organizer_id distinct) de un club. Reemplaza el patrón en [role]/layout.tsx que traía todas las filas para hacer distinct en memoria.';
