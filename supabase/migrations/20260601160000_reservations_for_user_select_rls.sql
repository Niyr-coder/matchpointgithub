-- RLS: el cliente (for_user_id) debe poder leer reservas creadas por el club
-- en su nombre, además del organizer (quien insertó la fila).

drop policy if exists res_select on public.reservations;
create policy res_select on public.reservations for select using (
  organizer_id = auth.uid()
  or for_user_id = auth.uid()
  or visibility = 'public'::mp_visibility
  or mp_club_staff(club_id)
  or mp_is_employee_of(club_id)
  or mp_user_is_reservation_participant(id, auth.uid())
);
