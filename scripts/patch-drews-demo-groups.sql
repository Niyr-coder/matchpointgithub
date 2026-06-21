-- Convierte el torneo demo @drews a fase de grupos con 32 cupos.
-- Idempotente por slug open-demo-matchpoint-jun2026

do $$
declare
  v_slug text := 'open-demo-matchpoint-jun2026';
  v_tournament uuid;
  v_category uuid;
  v_group_config jsonb := '{"groupsCount": 8, "advancePerGroup": 2, "finalScoringOverride": null}'::jsonb;
begin
  select id into v_tournament from tournaments where slug = v_slug;
  if v_tournament is null then
    raise exception 'Torneo demo no encontrado (slug=%). Ejecuta seed-drews-demo-tournament.sql primero.', v_slug;
  end if;

  select id into v_category
  from tournament_categories
  where tournament_id = v_tournament and name = 'Open Singles'
  limit 1;

  if v_category is null then
    raise exception 'Categoría Open Singles no encontrada para torneo %', v_tournament;
  end if;

  -- Limpiar bracket single_elim previo (si existía)
  delete from brackets where tournament_id = v_tournament;

  -- Limpiar fase de grupos previa (re-sorteo limpio)
  delete from tournament_group_matches
  where group_id in (
    select tg.id from tournament_groups tg where tg.category_id = v_category
  );
  delete from tournament_group_members
  where group_id in (
    select tg.id from tournament_groups tg where tg.category_id = v_category
  );
  delete from tournament_groups where category_id = v_category;

  update tournaments set
    format = 'groups_to_knockout',
    max_participants = 32,
    description = 'Torneo demo fase de grupos (32 cupos). 4 grupos, clasifica 1 por grupo. Gestiona como partner (@drews).',
    status = 'registration_open',
    updated_at = now()
  where id = v_tournament;

  update tournament_categories set
    max_teams = 32,
    stage = 'pending_groups',
    group_playoff_config = v_group_config
  where id = v_category;

  raise notice 'Torneo demo actualizado: id=% format=groups_to_knockout max=32', v_tournament;
end $$;

select
  t.id,
  t.slug,
  t.format,
  t.max_participants,
  t.status,
  tc.name as category,
  tc.stage,
  tc.group_playoff_config,
  tc.max_teams,
  (select count(*) from registrations r where r.tournament_id = t.id and r.status = 'accepted') as accepted
from tournaments t
join tournament_categories tc on tc.tournament_id = t.id
where t.slug = 'open-demo-matchpoint-jun2026';
