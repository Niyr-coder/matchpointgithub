-- 005 · Club applications (Solicitar Club wizard).
-- See docs/architecture/20-database.md §3.A and 30-rls.md §4.2.

create sequence club_application_code_seq;

create table club_applications (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('SC-' || lpad(nextval('club_application_code_seq')::text, 4, '0')),
  applicant_id uuid not null references profiles(id) on delete cascade,
  status mp_club_app_status not null default 'draft',
  current_step int not null default 1 check (current_step between 1 and 5),

  -- Step 1
  name text,
  org_type mp_club_org_type,
  sports mp_sport[] default '{}',
  short_description text check (short_description is null or length(short_description) <= 160),
  legal_name text,
  tax_id text,
  founded_year int,
  contact_person text,
  contact_email text,
  contact_phone text,
  website_or_social text,

  -- Step 2
  address text,
  district text,
  province text,
  country text,
  reference_note text,
  parking mp_parking_type,
  geo geography(point),
  geo_lat numeric(10,7),
  geo_lng numeric(10,7),
  location_verified_at timestamptz,
  location_verified_by uuid references profiles(id),

  -- Step 3 (court list lives in club_application_courts)
  weekly_hours jsonb default '{}',
  cancellation_policy mp_cancellation_policy default 'flexible_24h',

  -- Step 5
  terms_accepted_at timestamptz,
  commission_pct numeric(5,2) not null default 10.00,
  currency mp_currency,

  -- Review pipeline
  submitted_at timestamptz,
  reviewer_id uuid references profiles(id),
  review_started_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  reviewer_notes text,
  resulting_club_id uuid references clubs(id) on delete set null,

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index idx_club_applications_applicant on club_applications (applicant_id);
create index idx_club_applications_status on club_applications (status, created_at desc);

-- Only one active application per applicant.
create unique index uq_one_active_app_per_applicant
  on club_applications (applicant_id)
  where status in ('draft','submitted','docs_review','field_verification','final_review');

create trigger tg_club_applications_updated before update on club_applications
  for each row execute function tg_set_updated_at();

-- ── Proposed courts (materialize into `courts` on approval) ─────────────
create table club_application_courts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references club_applications(id) on delete cascade,
  ordinal int not null default 0,
  proposed_code text not null,
  sport mp_sport not null,
  surface text,
  indoor boolean not null default false,
  lights boolean not null default true,
  open_time time,
  close_time time,
  base_price_cents int,
  currency mp_currency,
  created_at timestamptz default now() not null
);
create index idx_club_app_courts_app on club_application_courts (application_id, ordinal);

-- ── Required documents ─────────────────────────────────────────────────
create table club_application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references club_applications(id) on delete cascade,
  kind mp_club_doc_kind not null,
  status mp_club_doc_status not null default 'pending',
  storage_path text,
  mime_type text,
  size_bytes bigint,
  filename text,
  uploaded_at timestamptz,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  unique (application_id, kind)
);

-- ── Gallery photos (4..6) ──────────────────────────────────────────────
create table club_application_photos (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references club_applications(id) on delete cascade,
  storage_path text not null,
  caption text,
  ordinal int not null default 0 check (ordinal between 0 and 5),
  created_at timestamptz default now() not null
);

-- ── Timeline events ────────────────────────────────────────────────────
create table club_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references club_applications(id) on delete cascade,
  kind mp_club_app_event_kind not null,
  actor_id uuid references profiles(id),
  actor_role text,
  payload jsonb default '{}',
  note text,
  created_at timestamptz default now() not null
);
create index idx_club_app_events_app_time on club_application_events (application_id, created_at desc);

-- ── Materialize function (called by admin approval Server Action) ──────
create or replace function fn_materialize_club_from_application(p_app_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _app club_applications%rowtype;
  _club_id uuid;
  _court club_application_courts%rowtype;
begin
  select * into _app from club_applications where id = p_app_id;

  if _app is null then
    raise exception 'application % not found', p_app_id;
  end if;

  if _app.status <> 'final_review' then
    raise exception 'application % must be in final_review, got %', p_app_id, _app.status;
  end if;

  insert into clubs (
    slug, name, description, country, city, address, geo, phone, email,
    currency, sports, status, applied_by, approved_by, approved_at
  ) values (
    lower(regexp_replace(coalesce(_app.name, 'club') || '-' || substr(_app.id::text, 1, 6),
                         '[^a-z0-9]+', '-', 'g')),
    _app.name,
    _app.short_description,
    coalesce(_app.country, 'XX'),
    coalesce(_app.district, '-'),
    _app.address,
    _app.geo,
    _app.contact_phone,
    _app.contact_email,
    coalesce(_app.currency, 'USD'::mp_currency),
    coalesce(_app.sports, '{}'::mp_sport[]),
    'active',
    _app.applicant_id,
    auth.uid(),
    now()
  )
  returning id into _club_id;

  insert into club_settings (club_id, reservation_window_days,
                             cancellation_window_hours, open_hours)
  values (
    _club_id, 14,
    case _app.cancellation_policy
      when 'flexible_24h' then 24
      when 'moderate_48h' then 48
      when 'strict_7d' then 168
    end,
    coalesce(_app.weekly_hours, '{}'::jsonb)
  );

  for _court in
    select * from club_application_courts
    where application_id = p_app_id
    order by ordinal
  loop
    -- Court inserts happen in 006_courts.sql; deferred to caller if courts
    -- table is not yet created. Wrapped to no-op gracefully here.
    begin
      insert into courts (club_id, code, sport, surface, indoor, lights, ordinal)
      values (_club_id, _court.proposed_code, _court.sport, _court.surface,
              _court.indoor, _court.lights, _court.ordinal);
    exception when undefined_table then
      -- Courts table not yet created in this DB. Caller should re-run after
      -- migration 006 lands.
      null;
    end;
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
  values (_app.applicant_id, 'owner', _club_id, auth.uid())
  on conflict do nothing;

  insert into club_application_events (application_id, kind, actor_id, payload)
  values (p_app_id, 'approved', auth.uid(),
          jsonb_build_object('club_id', _club_id));

  return _club_id;
end $$;

-- ── RLS ────────────────────────────────────────────────────────────────
alter table club_applications enable row level security;

create policy app_applicant_select on club_applications for select
  using (applicant_id = auth.uid());

create policy app_applicant_insert on club_applications for insert
  with check (applicant_id = auth.uid());

create policy app_applicant_update on club_applications for update
  using (applicant_id = auth.uid()
         and status in ('draft','submitted'))
  with check (applicant_id = auth.uid());

create policy app_applicant_delete on club_applications for delete
  using (applicant_id = auth.uid() and status = 'draft');

create policy app_admin_all on club_applications for all using (mp_is_admin());

alter table club_application_courts enable row level security;
create policy app_courts_applicant on club_application_courts for all
  using (exists(select 1 from club_applications a
                where a.id = application_id and a.applicant_id = auth.uid()));
create policy app_courts_admin on club_application_courts for all using (mp_is_admin());

alter table club_application_documents enable row level security;
create policy app_docs_applicant on club_application_documents for all
  using (exists(select 1 from club_applications a
                where a.id = application_id and a.applicant_id = auth.uid()));
create policy app_docs_admin on club_application_documents for all using (mp_is_admin());

alter table club_application_photos enable row level security;
create policy app_photos_applicant on club_application_photos for all
  using (exists(select 1 from club_applications a
                where a.id = application_id and a.applicant_id = auth.uid()));
create policy app_photos_admin on club_application_photos for all using (mp_is_admin());

alter table club_application_events enable row level security;
create policy app_events_visible on club_application_events for select
  using (
    mp_is_admin()
    or exists(select 1 from club_applications a
              where a.id = application_id and a.applicant_id = auth.uid())
  );
-- writes only via SECURITY DEFINER functions
revoke insert, update, delete on club_application_events from authenticated, anon;
