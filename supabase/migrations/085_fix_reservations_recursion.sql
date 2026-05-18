-- 🐛 Recursión infinita RLS entre reservations.res_select y
-- reservation_participants.rp_select. Ambas hacían EXISTS contra la otra
-- tabla, disparando RLS recursivamente. Fix igual al patrón mig 069 de
-- partner_members: helper SECURITY DEFINER que evade RLS dentro.
create or replace function public.mp_user_is_reservation_participant(_res_id uuid, _user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.reservation_participants
    where reservation_id = _res_id and user_id = _user_id
  );
$$;

revoke all on function public.mp_user_is_reservation_participant(uuid, uuid) from public;
grant execute on function public.mp_user_is_reservation_participant(uuid, uuid) to authenticated, anon, service_role;

drop policy if exists res_select on public.reservations;
create policy res_select on public.reservations for select using (
  organizer_id = auth.uid()
  or visibility = 'public'::mp_visibility
  or mp_club_staff(club_id)
  or mp_is_employee_of(club_id)
  or mp_user_is_reservation_participant(id, auth.uid())
);
