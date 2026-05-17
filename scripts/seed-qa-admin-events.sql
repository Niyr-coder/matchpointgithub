-- ── Seed QA · panel admin de eventos y torneos ─────────────────────────
--
-- Idempotente. Aplica datos minimos para correr el checklist de QA:
--   - Promueve a admin al user identificado por ADMIN_EMAIL.
--   - Crea (o reusa) un club de pruebas "Club QA MatchPoint".
--   - Crea un partner_org dueño del club + miembro admin = ADMIN_EMAIL.
--   - Crea 4 torneos con cada payment_policy (free / prepay / onsite / flexible).
--   - Crea 3 eventos (events.kind) con cada policy paga.
--
-- COMO USAR:
--   1) Pega este SQL en supabase Studio (SQL editor) o ejecutalo via MCP.
--   2) Cambia ADMIN_EMAIL al email del user que va a ser admin.
--   3) El user debe haberse registrado previamente (auth.users debe tenerlo).
--   4) Despues del seed, ese user ya puede entrar al /dashboard/admin y testear.
--
-- Para limpiar todo lo seedeado:
--   delete from tournaments where slug like 'qa-%';
--   delete from events where slug like 'qa-%';
--   delete from clubs where slug = 'club-qa-matchpoint';
--   delete from partner_orgs where slug = 'qa-partner';

do $$
declare
  -- ⬇️ CAMBIA ESTO al email del user que sera admin de QA.
  v_admin_email text := 'andrews@matchpoint.top';
  v_admin_id uuid;
  v_club_id uuid;
  v_partner_id uuid;
  v_now timestamptz := now();
begin
  -- 1. Resolver admin
  select id into v_admin_id from auth.users where email = v_admin_email;
  if v_admin_id is null then
    raise exception 'No existe auth.users con email %.  Registralo desde la app antes de correr el seed.', v_admin_email;
  end if;

  insert into role_assignments (user_id, role)
    values (v_admin_id, 'admin')
    on conflict do nothing;

  -- 2. Partner y club (idempotente)
  select id into v_partner_id from partner_orgs where slug = 'qa-partner';
  if v_partner_id is null then
    insert into partner_orgs (name, slug)
      values ('QA Partner', 'qa-partner')
      returning id into v_partner_id;
  end if;

  insert into partner_members (partner_id, user_id, role)
    values (v_partner_id, v_admin_id, 'admin')
    on conflict do nothing;

  select id into v_club_id from clubs where slug = 'club-qa-matchpoint';
  if v_club_id is null then
    insert into clubs (name, slug, city, country)
      values ('Club QA MatchPoint', 'club-qa-matchpoint', 'Quito', 'EC')
      returning id into v_club_id;
  end if;

  insert into partner_club_links (partner_id, club_id)
    values (v_partner_id, v_club_id)
    on conflict do nothing;

  -- 3. Torneos (uno por policy). Slug 'qa-tournament-<policy>'.
  insert into tournaments (
    partner_id, club_id, name, slug, sport, format,
    starts_at, ends_at, registration_opens_at, registration_closes_at,
    status, max_participants, entry_fee_cents, currency,
    payment_policy, created_by
  )
  values
    (v_partner_id, v_club_id, 'QA · Torneo gratis', 'qa-tournament-free',
     'pickleball', 'single_elim',
     v_now + interval '7 days', v_now + interval '7 days 4 hours',
     v_now, v_now + interval '6 days',
     'registration_open', 16, 0, 'USD',
     'free', v_admin_id),
    (v_partner_id, v_club_id, 'QA · Torneo prepay', 'qa-tournament-prepay',
     'pickleball', 'single_elim',
     v_now + interval '14 days', v_now + interval '14 days 4 hours',
     v_now, v_now + interval '13 days',
     'registration_open', 16, 1500, 'USD',
     'prepay', v_admin_id),
    (v_partner_id, v_club_id, 'QA · Torneo onsite', 'qa-tournament-onsite',
     'pickleball', 'single_elim',
     v_now + interval '21 days', v_now + interval '21 days 4 hours',
     v_now, v_now + interval '20 days',
     'registration_open', 16, 2000, 'USD',
     'onsite', v_admin_id),
    (v_partner_id, v_club_id, 'QA · Torneo flexible', 'qa-tournament-flexible',
     'pickleball', 'single_elim',
     v_now + interval '28 days', v_now + interval '28 days 4 hours',
     v_now, v_now + interval '27 days',
     'registration_open', 16, 2500, 'USD',
     'flexible', v_admin_id)
  on conflict (slug) do nothing;

  -- 4. Eventos kind (sin sport, distintos kind).
  insert into events (
    club_id, partner_id, organizer_id, name, slug, kind,
    starts_at, ends_at, capacity, price_cents, currency,
    payment_policy, status, visibility
  )
  values
    (v_club_id, v_partner_id, v_admin_id, 'QA · Evento gratis', 'qa-event-free',
     'social',
     v_now + interval '5 days', v_now + interval '5 days 3 hours',
     20, 0, 'USD', 'free', 'registration_open', 'public'),
    (v_club_id, v_partner_id, v_admin_id, 'QA · Evento prepay', 'qa-event-prepay',
     'clinic',
     v_now + interval '10 days', v_now + interval '10 days 3 hours',
     20, 1000, 'USD', 'prepay', 'registration_open', 'public'),
    (v_club_id, v_partner_id, v_admin_id, 'QA · Evento onsite', 'qa-event-onsite',
     'social',
     v_now + interval '15 days', v_now + interval '15 days 3 hours',
     20, 1200, 'USD', 'onsite', 'registration_open', 'public'),
    (v_club_id, v_partner_id, v_admin_id, 'QA · Evento flexible', 'qa-event-flexible',
     'exhibition',
     v_now + interval '20 days', v_now + interval '20 days 3 hours',
     20, 1500, 'USD', 'flexible', 'registration_open', 'public')
  on conflict (slug) do nothing;

  raise notice 'Seed QA aplicado. Admin: % (id %)', v_admin_email, v_admin_id;
  raise notice 'Club: % · Partner: %', v_club_id, v_partner_id;
end $$;
