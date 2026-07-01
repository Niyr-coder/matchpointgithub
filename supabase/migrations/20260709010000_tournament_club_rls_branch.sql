-- Los torneos organizados directamente por un club (sin partner_id externo)
-- no tenían branch de club staff en estas 3 policies -- solo autorizaban al
-- partner_admin del torneo. requireTournamentEditor/assertCanManageTournament
-- (src/server/actions/tournaments.ts) ya soportan ese caso (actorRole "club")
-- desde el fix de tournament-monitors.ts etc; esta migration alinea las
-- policies de Postgres con ese mismo contrato. Cada tabla ya tiene su propia
-- policy _admin_all, así que no hace falta re-agregar admin acá.

drop policy if exists tcm_partner_all on public.tournament_court_monitors;
create policy tcm_partner_all on public.tournament_court_monitors
  for all using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (
          (t.partner_id is not null and mp_is_partner_admin_of(t.partner_id))
          or (t.club_id is not null and mp_club_staff(t.club_id))
        )
    )
  );

drop policy if exists reg_subs_partner_all on public.registration_substitutions;
create policy reg_subs_partner_all on public.registration_substitutions
  for all using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (
          (t.partner_id is not null and mp_is_partner_admin_of(t.partner_id))
          or (t.club_id is not null and mp_club_staff(t.club_id))
        )
    )
  );

drop policy if exists mi_partner_select on public.match_incidents;
create policy mi_partner_select on public.match_incidents
  for select using (
    exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and (
          (t.partner_id is not null and mp_is_partner_admin_of(t.partner_id))
          or (t.club_id is not null and mp_club_staff(t.club_id))
        )
    )
  );
