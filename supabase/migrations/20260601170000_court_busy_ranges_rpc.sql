-- Disponibilidad de cancha para el drawer de reserva: devuelve solo tramos
-- ocupados (sin PII) para que cualquier jugador autenticado vea choques reales.
-- RLS res_select no expone reservas ajenas con visibility=private.

create or replace function public.mp_court_busy_ranges(
  p_club_id uuid,
  p_court_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  status public.mp_reservation_status
)
language sql
security definer
set search_path = public
stable
as $$
  select
    lower(r.during) as starts_at,
    upper(r.during) as ends_at,
    r.status
  from public.reservations r
  where r.club_id = p_club_id
    and r.court_id = p_court_id
    and r.status <> 'cancelled'::public.mp_reservation_status
    and r.during && tstzrange(p_from, p_to, '[)');
$$;

revoke all on function public.mp_court_busy_ranges(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.mp_court_busy_ranges(uuid, uuid, timestamptz, timestamptz) to authenticated, anon, service_role;
