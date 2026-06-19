-- Sincroniza geography(geo) ↔ lat/lng numéricos en solicitudes y clubs.
-- Al aprobar una solicitud, materializa coords en el club resultante.

-- ── Triggers: club_applications (geo_lat/geo_lng ↔ geo) ─────────────────
create or replace function tg_sync_application_geo_coords()
returns trigger
language plpgsql
as $$
begin
  if new.geo_lat is not null and new.geo_lng is not null then
    new.geo := st_setsrid(st_makepoint(new.geo_lng, new.geo_lat), 4326)::geography;
  elsif new.geo is not null and (new.geo_lat is null or new.geo_lng is null) then
    new.geo_lat := st_y(new.geo::geometry);
    new.geo_lng := st_x(new.geo::geometry);
  end if;
  return new;
end;
$$;

drop trigger if exists tg_club_applications_sync_geo on club_applications;
create trigger tg_club_applications_sync_geo
  before insert or update on club_applications
  for each row execute function tg_sync_application_geo_coords();

-- ── Triggers: clubs (latitude/longitude ↔ geo) ───────────────────────────
create or replace function tg_sync_club_geo_coords()
returns trigger
language plpgsql
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.geo := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  elsif new.geo is not null and (new.latitude is null or new.longitude is null) then
    new.latitude := st_y(new.geo::geometry);
    new.longitude := st_x(new.geo::geometry);
  end if;
  return new;
end;
$$;

drop trigger if exists tg_clubs_sync_geo_coords on clubs;
create trigger tg_clubs_sync_geo_coords
  before insert or update on clubs
  for each row execute function tg_sync_club_geo_coords();

-- ── Backfill filas existentes ────────────────────────────────────────────
update club_applications
set geo = st_setsrid(st_makepoint(geo_lng, geo_lat), 4326)::geography
where geo_lat is not null
  and geo_lng is not null
  and geo is null;

update clubs
set geo = st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
where latitude is not null
  and longitude is not null
  and geo is null;

update clubs
set latitude = st_y(geo::geometry),
    longitude = st_x(geo::geometry)
where geo is not null
  and (latitude is null or longitude is null);

-- ── Materialize: copiar coords de la solicitud al club ──────────────────
drop function if exists public.fn_materialize_club_from_application(uuid);

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

  _slug := lower(regexp_replace(
    coalesce(nullif(trim(_app.name), ''), 'club') || '-' || substr(_app.id::text, 1, 8),
    '[^a-z0-9]+', '-', 'g'
  ));

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
