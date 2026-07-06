-- Fix: generación de slug al materializar un club desde su solicitud.
--
-- Bug: el regexp_replace('[^a-z0-9]+', '-') corría ANTES del lower(), así que
-- toda mayúscula o letra con tilde se convertía en guion. "Federación
-- Ecuatoriana de Pickleball" → "-ederaci-n-cuatoriana-de-ickleball-…".
--
-- Fix: lower() + translate() de tildes ANTES del replace, y trim de guiones
-- en los extremos. Incluye backfill del único slug corrupto en prod.

create or replace function public.fn_materialize_club_from_application(
  p_app_id uuid,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _app club_applications%rowtype;
  _club_id uuid;
  _court club_application_courts%rowtype;
  _actor uuid;
  _slug text;
  _club_name text;
  _cancel_hours int;
  _lat numeric;
  _lng numeric;
  _geo geography(point);
begin
  select * into _app from club_applications where id = p_app_id;

  if _app is null then
    raise exception 'application % not found', p_app_id;
  end if;

  if _app.status <> 'final_review' then
    raise exception 'application % must be in final_review, got %', p_app_id, _app.status;
  end if;

  _actor := coalesce(
    p_actor_id,
    nullif(current_setting('app.audit_actor_id', true), '')::uuid
  );

  _club_name := coalesce(
    nullif(trim(_app.name), ''),
    nullif(trim(_app.legal_name), ''),
    'Club sin nombre'
  );

  -- lower() y translate() de tildes ANTES de reemplazar lo no-alfanumérico;
  -- si el nombre queda vacío tras limpiar, cae a 'club'.
  _slug := trim(both '-' from regexp_replace(
    translate(
      lower(coalesce(nullif(trim(_app.name), ''), 'club')),
      'áàäâéèëêíìïîóòöôúùüûñç',
      'aaaaeeeeiiiioooouuuunc'
    ) || '-' || substr(_app.id::text, 1, 8),
    '[^a-z0-9]+', '-', 'g'
  ));
  if _slug is null or _slug = '' then
    _slug := 'club-' || substr(_app.id::text, 1, 8);
  end if;

  while exists (select 1 from clubs where slug = _slug) loop
    _slug := _slug || '-' || substr(gen_random_uuid()::text, 1, 4);
  end loop;

  _cancel_hours := case coalesce(_app.cancellation_policy, 'flexible_24h'::mp_cancellation_policy)
    when 'flexible_24h' then 24
    when 'moderate_48h' then 48
    when 'strict_7d' then 168
    else 24
  end;

  _lat := _app.geo_lat;
  _lng := _app.geo_lng;
  _geo := coalesce(
    _app.geo,
    case
      when _lat is not null and _lng is not null
        then st_setsrid(st_makepoint(_lng, _lat), 4326)::geography
      else null
    end
  );

  insert into clubs (
    slug, name, description, country, city, address, geo, latitude, longitude,
    phone, email, currency, sports, status, applied_by, approved_by, approved_at
  ) values (
    _slug,
    _club_name,
    _app.short_description,
    coalesce(_app.country, 'XX'),
    coalesce(_app.district, '-'),
    _app.address,
    _geo,
    _lat,
    _lng,
    _app.contact_phone,
    _app.contact_email,
    coalesce(_app.currency, 'USD'::mp_currency),
    coalesce(_app.sports, '{}'::mp_sport[]),
    'active',
    _app.applicant_id,
    _actor,
    now()
  )
  returning id into _club_id;

  insert into club_settings (club_id, reservation_window_days, cancellation_window_hours, open_hours)
  values (
    _club_id,
    14,
    _cancel_hours,
    coalesce(_app.weekly_hours, '{}'::jsonb)
  );

  for _court in
    select * from club_application_courts
    where application_id = p_app_id
    order by ordinal
  loop
    insert into courts (club_id, code, sport, surface, indoor, lights, ordinal)
    values (
      _club_id,
      _court.proposed_code,
      _court.sport,
      _court.surface,
      _court.indoor,
      _court.lights,
      _court.ordinal
    );
  end loop;

  insert into club_photos (club_id, url, ordinal)
  select _club_id, storage_path, ordinal
  from club_application_photos
  where application_id = p_app_id;

  update club_applications
    set status = 'approved',
        approved_at = now(),
        resulting_club_id = _club_id
    where id = p_app_id;

  insert into role_assignments (user_id, role, club_id, granted_by)
  values (_app.applicant_id, 'owner', _club_id, _actor)
  on conflict do nothing;

  insert into club_application_events (application_id, kind, actor_id, payload)
  values (
    p_app_id,
    'approved',
    _actor,
    jsonb_build_object('club_id', _club_id)
  );

  return _club_id;
end;
$$;

grant execute on function public.fn_materialize_club_from_application(uuid, uuid) to authenticated, service_role;

-- ── Backfill: corregir el slug corrupto de la Federación ─────────────────
update clubs
set slug = 'federacion-ecuatoriana-de-pickleball'
where slug = '-ederaci-n-cuatoriana-de-ickleball-f5a0db59'
  and not exists (
    select 1 from clubs where slug = 'federacion-ecuatoriana-de-pickleball'
  );
