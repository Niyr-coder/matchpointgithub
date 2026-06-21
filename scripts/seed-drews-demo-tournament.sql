-- Torneo demo lleno para @drews: admin + partner + jugador.
-- Idempotente por slug open-demo-matchpoint-jun2026

do $$
declare
  v_drews uuid := '8a4a19f7-199a-4044-acef-6362fce34325';
  v_partner uuid := '3c5dbf35-9330-46ca-ac9c-2745007fd286';
  v_club uuid := '891408c0-c2f7-45da-984a-fe8ee873a224';
  v_slug text := 'open-demo-matchpoint-jun2026';
  v_tournament uuid;
  v_category uuid;
  v_now timestamptz := now();
  v_players uuid[] := array[
    '8a4a19f7-199a-4044-acef-6362fce34325'::uuid,
    '04a24af8-6ea3-46d2-984f-3fdae8607328'::uuid,
    'db6e7683-8ba1-495d-aff3-ce19f12e8b7b'::uuid,
    'b0231e63-933a-482b-a69a-c559df8dfbb7'::uuid,
    '321d69b4-e422-44ca-868b-99a72a1d48b2'::uuid,
    '54dd7fdc-26fa-4eae-88ee-07b11d5fdceb'::uuid,
    '8598837a-ed3d-425d-90b2-8eca9dbf8c38'::uuid,
    '7b371539-5c4d-4dfb-bfa0-944ed56931a5'::uuid
  ];
  v_player uuid;
begin
  insert into partner_members (partner_id, user_id, role)
  values (v_partner, v_drews, 'admin')
  on conflict (partner_id, user_id) do update set role = excluded.role;

  if not exists (
    select 1 from role_assignments
    where user_id = v_drews and role = 'partner' and partner_id = v_partner and revoked_at is null
  ) then
    insert into role_assignments (user_id, role, partner_id, granted_by)
    values (v_drews, 'partner', v_partner, v_drews);
  end if;

  insert into partner_club_links (partner_id, club_id, revenue_share_pct)
  values (v_partner, v_club, 0)
  on conflict (partner_id, club_id) do nothing;

  select id into v_tournament from tournaments where slug = v_slug;

  if v_tournament is null then
    insert into tournaments (
      partner_id, club_id, name, slug, description, sport, format, modality,
      starts_at, ends_at, registration_opens_at, registration_closes_at,
      status, max_participants, entry_fee_cents, currency, payment_policy,
      prize_pool_cents, created_by
    ) values (
      v_partner,
      v_club,
      'Open Demo MATCHPOINT · Jun 2026',
      v_slug,
      'Torneo demo fase de grupos (32 cupos). 8 grupos de 4, clasifica 2 por grupo. Gestiona como partner (@drews).',
      'pickleball',
      'groups_to_knockout',
      'singles',
      v_now + interval '14 days',
      v_now + interval '14 days 6 hours',
      v_now - interval '1 day',
      v_now + interval '13 days',
      'registration_open',
      32,
      0,
      'USD',
      'free',
      0,
      v_drews
    )
    returning id into v_tournament;
  else
    update tournaments set
      partner_id = v_partner,
      club_id = v_club,
      format = 'groups_to_knockout',
      status = 'registration_open',
      max_participants = 32,
      description = 'Torneo demo fase de grupos (32 cupos). 8 grupos de 4, clasifica 2 por grupo. Gestiona como partner (@drews).',
      registration_opens_at = v_now - interval '1 day',
      registration_closes_at = v_now + interval '13 days',
      updated_at = v_now
    where id = v_tournament;
  end if;

  select id into v_category
  from tournament_categories
  where tournament_id = v_tournament and name = 'Open Singles'
  limit 1;

  if v_category is null then
    insert into tournament_categories (
      tournament_id, name, gender, max_teams, stage, group_playoff_config
    ) values (
      v_tournament,
      'Open Singles',
      'open',
      32,
      'pending_groups',
      '{"groupsCount": 8, "advancePerGroup": 2, "finalScoringOverride": null}'::jsonb
    )
    returning id into v_category;
  else
    update tournament_categories set
      max_teams = 32,
      stage = 'pending_groups',
      group_playoff_config = '{"groupsCount": 8, "advancePerGroup": 2, "finalScoringOverride": null}'::jsonb
    where id = v_category;
  end if;

  delete from brackets where tournament_id = v_tournament;

  delete from registrations where tournament_id = v_tournament;

  foreach v_player in array v_players loop
    insert into registrations (
      tournament_id, category_id, player_ids, registered_by, status
    ) values (
      v_tournament,
      v_category,
      array[v_player],
      v_player,
      'accepted'
    );
  end loop;

  raise notice 'Torneo demo listo: id=% slug=% inscritos=%', v_tournament, v_slug, array_length(v_players, 1);
end $$;

select t.id, t.slug, t.name, t.status, t.max_participants,
       (select count(*) from registrations r where r.tournament_id = t.id and r.status = 'accepted') as accepted
from tournaments t
where slug = 'open-demo-matchpoint-jun2026';
