-- ── Seed QA · MAT-70 Slice 2 (UI plan club) ─────────────────────────────
--
-- Idempotente. Crea un club mínimo en estado active para que admin pueda
-- probar grant/revoke de plan (Club Pro / Partner) desde
-- /dashboard/admin/admin-clubs.
--
-- Crea:
--   - 1 club "Club Test MAT-70" (slug: club-test-mat70), starter por default.
--   - 1 role_assignment owner para el user identificado por OWNER_EMAIL (si
--     existe en auth.users; si no, lo deja sin owner).
--   - 2 courts activas (necesario después para probar el cap de Slice 3).
--   - 1 club_settings con defaults razonables.
--
-- COMO USAR:
--   1) Pega este SQL en Supabase Studio (SQL editor) o ejecutalo via MCP.
--   2) Si querés asignar owner, cambia v_owner_email al email de un user
--      registrado. Si no, el club queda sin owner (admin igual puede
--      manejarlo desde /admin/admin-clubs).
--   3) Después corre el seed, vas a /dashboard/admin/admin-clubs y el club
--      aparece con badge "Starter". Probás el kebab → "Activar Club Pro".
--
-- Para limpiar:
--   delete from courts where club_id in (select id from clubs where slug = 'club-test-mat70');
--   delete from clubs where slug = 'club-test-mat70';

do $$
declare
  -- ⬇️ CAMBIA ESTO al email del user que va a ser owner del club test.
  --    Si dejás un email que no existe en auth.users, el club queda sin owner.
  v_owner_email text := 'vicentmaldo12@gmail.com';
  v_owner_id uuid;
  v_club_id uuid;
begin
  -- 1. Resolver owner (opcional)
  select id into v_owner_id from auth.users where email = v_owner_email;

  -- 2. Crear club (idempotente por slug)
  select id into v_club_id from clubs where slug = 'club-test-mat70';
  if v_club_id is null then
    insert into clubs (
      name, slug, city, country, status,
      timezone, currency, sports,
      applied_by, approved_by, approved_at
    )
    values (
      'Club Test MAT-70', 'club-test-mat70', 'Quito', 'EC', 'active',
      'America/Guayaquil', 'USD', array['padel', 'tenis']::mp_sport[],
      v_owner_id, v_owner_id, now()
    )
    returning id into v_club_id;
    raise notice 'Creado club Test MAT-70 con id %', v_club_id;
  else
    raise notice 'Club Test MAT-70 ya existe (id %)', v_club_id;
  end if;

  -- 3. club_settings (idempotente por PK)
  insert into club_settings (club_id, reservation_window_days, default_slot_minutes, allow_walkins)
    values (v_club_id, 14, 60, true)
    on conflict (club_id) do nothing;

  -- 4. Asignar owner si tenemos uno
  if v_owner_id is not null then
    insert into role_assignments (user_id, role, club_id)
      values (v_owner_id, 'owner', v_club_id)
      on conflict do nothing;
    raise notice 'Asignado owner % al club', v_owner_email;
  else
    raise notice 'No existe auth.users con email %, club queda sin owner.', v_owner_email;
  end if;

  -- 5. 2 canchas activas
  insert into courts (club_id, code, name, sport, indoor, lights, ordinal, active)
  values
    (v_club_id, 'C1', 'Cancha 1', 'padel', false, true, 0, true),
    (v_club_id, 'C2', 'Cancha 2', 'padel', true,  true, 1, true)
  on conflict do nothing;

  raise notice '✓ Seed MAT-70 completo. Andá a /dashboard/admin/admin-clubs.';
end $$;
