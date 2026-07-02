-- 20260714000000 · Walkover de torneo NO mueve el rating.
--
-- Divergencia detectada en el audit 2026-07-01: los triggers de ELO de
-- bracket_matches/tournament_group_matches disparaban por cambio de
-- winner_side SIN exigir status, así que un walkover (declareWalkover setea
-- winner_side + status='walkover') aplicaba ELO y sumaba matches_total/W/L.
-- Los partidos casuales (mig 058) solo aplican en status='confirmed'.
--
-- Decisión de producto (2026-07-01): un walkover no debe mover el MPR de
-- nadie ni contar como partido jugado. Los triggers ahora exigen status
-- 'reported' o 'confirmed' para aplicar (y para re-aplicar tras una
-- corrección de ganador). Walkovers ya aplicados antes de esta mig quedan
-- como están (legacy).

create or replace function tg_bracket_matches_elo_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.winner_side is not null
     and old.rating_applied_at is not null
     and old.winner_side is distinct from new.winner_side then
    if fn_revert_elo_for_match('bracket', new.id) then
      if new.status in ('reported', 'confirmed') then
        perform fn_recalculate_elo_for_bracket_match(new.id);
      end if;
    end if;
  elsif new.winner_side is not null
     and new.status in ('reported', 'confirmed')
     and (old.winner_side is distinct from new.winner_side
          or old.status is distinct from new.status)
     and new.rating_applied_at is null then
    perform fn_recalculate_elo_for_bracket_match(new.id);
  end if;
  return null;
end;
$$;

create or replace function tg_group_matches_elo_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.winner_side is not null
     and old.rating_applied_at is not null
     and old.winner_side is distinct from new.winner_side then
    if fn_revert_elo_for_match('group', new.id) then
      if new.status in ('reported', 'confirmed') then
        perform fn_recalculate_elo_for_group_match(new.id);
      end if;
    end if;
  elsif new.winner_side is not null
     and new.status in ('reported', 'confirmed')
     and (old.winner_side is distinct from new.winner_side
          or old.status is distinct from new.status)
     and new.rating_applied_at is null then
    perform fn_recalculate_elo_for_group_match(new.id);
  end if;
  return null;
end;
$$;
