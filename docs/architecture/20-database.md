# 20 · Database schema

> SQL listo para alimentar migraciones de Supabase. RLS se define en `30-rls.md`. Triggers de auditoría y de `updated_at` van en `99-extensions.sql` (un solo lugar, aplicado al final).

---

## 0. Extensiones y helpers globales

```sql
create extension if not exists "pgcrypto";      -- gen_random_uuid
create extension if not exists "pg_trgm";       -- búsqueda fuzzy
create extension if not exists "btree_gist";    -- tsrange exclusion (slots)
create extension if not exists "pg_cron";       -- jobs scheduler
create extension if not exists "unaccent";

-- updated_at universal
create or replace function tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- audit_log writer reutilizable
-- mig 086: prefiere current_setting('app.audit_actor_id') sobre auth.uid()
-- para capturar al admin cuando la acción usa service-role (donde auth.uid()
-- es null). El admin client debe llamar mp_set_audit_actor(adminId, 'admin')
-- antes de cada mutación (helper TS: setAuditActor en src/lib/db/client.admin.ts).
create or replace function tg_audit() returns trigger language plpgsql as $$
declare _actor uuid := coalesce(
          auth.uid(),
          nullif(current_setting('app.audit_actor_id', true), '')::uuid
        );
        _role text := coalesce(
          nullif(current_setting('app.audit_actor_role', true), ''),
          nullif(current_setting('app.active_role', true), ''),
          case when _actor is not null then 'user' else 'system' end
        );
        _club uuid := nullif(current_setting('app.active_club_id', true), '')::uuid;
        _diff jsonb;
begin
  _diff := case TG_OP
    when 'INSERT' then to_jsonb(NEW)
    when 'DELETE' then to_jsonb(OLD)
    when 'UPDATE' then jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
  end;
  insert into audit_log (actor_id, actor_role, club_id, entity, entity_id, action, diff)
  values (_actor, _role, _club, TG_TABLE_NAME, coalesce((NEW).id, (OLD).id), TG_OP, _diff);
  return coalesce(NEW, OLD);
end $$;
```

> **Patrón admin actor (mig 086).** Cuando una server action admin hace
> mutación vía `getAdminClient()` (service-role), `auth.uid()` retorna
> null y el trigger registraría `actor_id=null, actor_role='system'`. Eso
> rompe trazabilidad ("¿quién dio premium a este user?"). Fix: llamar
> `setAuditActor(admin, adminId, 'admin')` antes de cualquier UPDATE/
> INSERT/DELETE. Internamente hace `select set_config('app.audit_actor_id',
> adminId, false)`. Limitación PgBouncer: como el setting es por sesión
> sin `is_local=true`, la conexión puede reciclarse entre requests; es
> best-effort, no bulletproof. Ya aplicado en `player-subscriptions.ts`
> (grant/revoke MATCHPOINT+) y `payment-proofs.ts` (approve/reject).
> Acciones admin de torneos no necesitan el helper porque usan
> `getServerClient()` (cookie-auth, sí captura `auth.uid()`).

---

## 1. Enums compartidos

```sql
create type mp_sport as enum ('tennis','padel','pickleball');
create type mp_skill_level as enum ('beginner','intermediate','advanced','pro');
create type mp_role as enum ('admin','partner','user','owner','manager','coach','employee');
create type mp_currency as enum ('USD','MXN','CLP','ARS','BRL','EUR');
create type mp_payment_method as enum ('cash','card','transfer','wallet','free');
create type mp_payment_status as enum ('pending','authorized','captured','refunded','failed','disputed');
create type mp_reservation_status as enum ('booked','confirmed','checked_in','no_show','cancelled','completed');
create type mp_class_kind as enum ('group','clinic','camp','one_on_one','semi_private');
create type mp_visibility as enum ('public','members','private');
create type mp_event_status as enum ('draft','published','registration_open','registration_closed','live','finished','cancelled');
create type mp_tournament_format as enum ('single_elim','double_elim','round_robin','swiss','groups_to_knockout');
create type mp_match_status as enum ('scheduled','live','reported','confirmed','disputed','walkover','cancelled');
create type mp_ticket_status as enum ('open','in_progress','waiting_user','resolved','closed');
create type mp_ticket_severity as enum ('low','medium','high','critical');
create type mp_report_status as enum ('pending','reviewing','actioned','dismissed');
create type mp_notification_channel as enum ('inapp','email','push','sms');
```

---

## 2. Dominio · identity

```sql
-- profiles: 1:1 con auth.users (managed by Supabase)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (length(username) between 3 and 24),
  display_name text not null,
  avatar_url text,
  bio text,
  country text,
  city text,
  birthdate date,
  preferred_sport mp_sport,
  skill_level mp_skill_level,
  phone text,
  phone_verified_at timestamptz,
  locale text default 'es' not null,
  -- Migration 041: flag para wizard de primer login.
  -- null = no completó onboarding (mostrar wizard); timestamp = ya pasó o skippeó.
  onboarded_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_profiles_username_trgm on profiles using gin (username gin_trgm_ops);
create index idx_profiles_display_trgm on profiles using gin (display_name gin_trgm_ops);

-- role_assignments: qué roles tiene un usuario y en qué scope
create table role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role mp_role not null,
  club_id uuid references clubs(id) on delete cascade,        -- null para roles globales (admin, user, partner)
  partner_id uuid references partner_orgs(id) on delete cascade, -- para role=partner
  granted_by uuid references profiles(id),
  granted_at timestamptz default now() not null,
  revoked_at timestamptz,
  notes text,
  unique (user_id, role, club_id, partner_id)
);
create index idx_role_assignments_user on role_assignments (user_id) where revoked_at is null;
create index idx_role_assignments_club on role_assignments (club_id) where revoked_at is null;

-- role_requests: cuando un user pide un rol (ej. solicitar ser owner)
create table role_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  requested_role mp_role not null,
  target_club_id uuid references clubs(id),
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  reviewer_notes text,
  created_at timestamptz default now() not null
);

-- sessions: opcional, para listar/cerrar sesiones desde UI
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  ua text, ip inet, last_seen_at timestamptz default now(),
  created_at timestamptz default now() not null
);
```

---

## 3. Dominio · clubs

```sql
create table clubs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  logo_url text,
  cover_url text,
  country text not null,
  city text not null,
  address text,
  geo geography(point),
  phone text,
  email text,
  timezone text not null default 'UTC',
  currency mp_currency not null default 'USD',
  sports mp_sport[] not null default '{}',
  status text not null default 'active' check (status in ('pending','active','suspended','archived')),
  applied_by uuid references profiles(id),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_clubs_geo on clubs using gist (geo);
create index idx_clubs_name_trgm on clubs using gin (name gin_trgm_ops);

create table club_settings (
  club_id uuid primary key references clubs(id) on delete cascade,
  reservation_window_days int not null default 14,
  cancellation_window_hours int not null default 4,
  default_slot_minutes int not null default 60,
  allow_walkins boolean not null default true,
  charge_no_show_pct int not null default 50,
  open_hours jsonb not null default '{}',  -- {"mon":[["07:00","23:00"]], ...}
  updated_at timestamptz default now() not null
);

create table club_amenities (
  club_id uuid not null references clubs(id) on delete cascade,
  amenity text not null,  -- 'parking','showers','restaurant','pro_shop','wifi',...
  primary key (club_id, amenity)
);

create table club_photos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  url text not null,
  caption text,
  ordinal int not null default 0,
  created_at timestamptz default now() not null
);
```

---

## 3.A. Sub-dominio · club applications (wizard "Solicitar Club")

> Cubre `SolicitarClubFlow.html` (5 pasos + submitted + approved). La tabla `clubs` **NO se crea hasta que la aplicación es aprobada**. La aplicación tiene autosave por step y un pipeline de revisión propio.

```sql
create type mp_club_app_status as enum (
  'draft',                -- usuario rellenando (steps 1-5)
  'submitted',            -- step 5 enviado, en cola de revisión
  'docs_review',          -- equipo validando documentos
  'field_verification',   -- visita de campo agendada/en curso
  'final_review',         -- listo para aprobación final
  'approved',             -- ✅ se materializó en una fila de `clubs`
  'rejected',
  'withdrawn'             -- usuario canceló su propia solicitud
);

create type mp_club_org_type as enum ('private','public','concession');
create type mp_parking_type as enum ('unknown','street','private','valet');
create type mp_cancellation_policy as enum ('flexible_24h','moderate_48h','strict_7d');

create sequence club_application_code_seq;

create table club_applications (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('SC-' || lpad(nextval('club_application_code_seq')::text, 4, '0')),
  applicant_id uuid not null references profiles(id) on delete cascade,
  status mp_club_app_status not null default 'draft',
  current_step int not null default 1 check (current_step between 1 and 5),

  -- Step 1 · Datos del club
  name text,
  org_type mp_club_org_type,
  sports mp_sport[] default '{}',
  short_description text check (length(short_description) <= 160),
  legal_name text,
  tax_id text,                                    -- RUC / CUIT / RFC según país
  founded_year int,
  contact_person text,
  contact_email text,
  contact_phone text,
  website_or_social text,

  -- Step 2 · Ubicación
  address text,
  district text,                                  -- parroquia / sector
  province text,
  country text,
  reference_note text,
  parking mp_parking_type,
  geo geography(point),
  geo_lat numeric(10,7),
  geo_lng numeric(10,7),
  location_verified_at timestamptz,
  location_verified_by uuid references profiles(id),

  -- Step 3 · Canchas (resumen; detalle en club_application_courts)
  weekly_hours jsonb default '{}',                -- {"mon":[["06:00","22:00"]],...}
  cancellation_policy mp_cancellation_policy default 'flexible_24h',

  -- Step 5 · Términos
  terms_accepted_at timestamptz,
  commission_pct numeric(5,2) not null default 10.00,

  -- Review pipeline
  submitted_at timestamptz,
  reviewer_id uuid references profiles(id),
  review_started_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  reviewer_notes text,
  resulting_club_id uuid references clubs(id) on delete set null,  -- backref al club creado al aprobar

  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_club_applications_applicant on club_applications (applicant_id);
create index idx_club_applications_status on club_applications (status, created_at desc);

-- Step 3 · Canchas propuestas (al aprobar se materializan en `courts`)
create table club_application_courts (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references club_applications(id) on delete cascade,
  ordinal int not null default 0,
  proposed_code text not null,                     -- 'C1','C2',...
  sport mp_sport not null,
  surface text,                                    -- 'acrylic_outdoor','synthetic_indoor',...
  indoor boolean not null default false,
  lights boolean not null default true,
  open_time time,
  close_time time,
  base_price_cents int,
  currency mp_currency,
  created_at timestamptz default now() not null
);
create index idx_club_app_courts_app on club_application_courts (application_id, ordinal);

-- Step 4 · Documentos requeridos
create type mp_club_doc_kind as enum (
  'tax_id_certificate',     -- RUC actualizado
  'incorporation_act',      -- acta constitutiva
  'land_use_permit',        -- certificado de uso de suelo
  'liability_insurance',    -- opcional según país
  'health_permit',          -- opcional
  'other'
);
create type mp_club_doc_status as enum ('pending','uploaded','approved','rejected');

create table club_application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references club_applications(id) on delete cascade,
  kind mp_club_doc_kind not null,
  status mp_club_doc_status not null default 'pending',
  storage_path text,                               -- ruta en bucket `kyc-docs`
  mime_type text,
  size_bytes bigint,
  filename text,
  uploaded_at timestamptz,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  unique (application_id, kind)
);

-- Step 4 · Fotos del club (mín 4, máx 6 según UI)
create table club_application_photos (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references club_applications(id) on delete cascade,
  storage_path text not null,                      -- bucket `club-covers` (privado hasta aprobación)
  caption text,
  ordinal int not null default 0,
  created_at timestamptz default now() not null,
  check (ordinal between 0 and 5)
);

-- Timeline del proceso de revisión (para la pantalla "Submitted")
create type mp_club_app_event_kind as enum (
  'created','step_completed','submitted',
  'docs_review_started','docs_approved','docs_rejected',
  'field_scheduled','field_completed',
  'final_review_started','approved','rejected','withdrawn',
  'note_added','contacted'
);

create table club_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references club_applications(id) on delete cascade,
  kind mp_club_app_event_kind not null,
  actor_id uuid references profiles(id),
  actor_role text,
  payload jsonb default '{}',                     -- {step:2}, {document_kind:'tax_id'}, etc.
  note text,
  created_at timestamptz default now() not null
);
create index idx_club_app_events_app_time on club_application_events (application_id, created_at desc);

-- Function: materializar club al aprobar (llamada por el server action approveApplication)
create or replace function fn_materialize_club_from_application(p_app_id uuid)
returns uuid language plpgsql security definer as $$
declare _app club_applications%rowtype;
        _club_id uuid;
        _court club_application_courts%rowtype;
begin
  select * into _app from club_applications where id = p_app_id;
  if _app.status <> 'final_review' then
    raise exception 'application % must be in final_review, got %', p_app_id, _app.status;
  end if;

  insert into clubs (
    slug, name, description, country, city, address, geo, phone, email, currency, sports,
    status, applied_by, approved_by, approved_at
  ) values (
    lower(regexp_replace(_app.name || '-' || substr(_app.id::text,1,6), '[^a-z0-9]+', '-', 'g')),
    _app.name,
    _app.short_description,
    coalesce(_app.country,'XX'),
    coalesce(_app.district,'-'),
    _app.address,
    _app.geo,
    _app.contact_phone,
    _app.contact_email,
    coalesce(_app.currency_from_app(), 'USD'::mp_currency),  -- helper o NULL
    _app.sports,
    'active', _app.applicant_id, auth.uid(), now()
  ) returning id into _club_id;

  insert into club_settings (club_id, reservation_window_days, cancellation_window_hours, open_hours)
  values (
    _club_id, 14,
    case _app.cancellation_policy
      when 'flexible_24h' then 24
      when 'moderate_48h' then 48
      when 'strict_7d' then 168
    end,
    _app.weekly_hours
  );

  -- Materializar canchas
  for _court in select * from club_application_courts where application_id = p_app_id order by ordinal
  loop
    insert into courts (club_id, code, sport, surface, indoor, lights, ordinal)
    values (_club_id, _court.proposed_code, _court.sport, _court.surface,
            _court.indoor, _court.lights, _court.ordinal);
  end loop;

  -- Materializar fotos (mover de bucket privado a público)
  insert into club_photos (club_id, url, ordinal)
  select _club_id, storage_path, ordinal from club_application_photos where application_id = p_app_id;

  -- Marcar aplicación aprobada
  update club_applications
    set status = 'approved', approved_at = now(), resulting_club_id = _club_id
    where id = p_app_id;

  -- Otorgar role owner al applicant
  insert into role_assignments (user_id, role, club_id, granted_by)
  values (_app.applicant_id, 'owner', _club_id, auth.uid())
  on conflict do nothing;

  -- Emit evento
  insert into club_application_events (application_id, kind, actor_id, payload)
  values (p_app_id, 'approved', auth.uid(), jsonb_build_object('club_id', _club_id));

  return _club_id;
end $$;
```

### Mapeo wizard → datos

| Step UI | Tablas que escribe |
|---|---|
| 1 · Datos del club | `club_applications` (name, org_type, sports, short_description, legal_name, tax_id, founded_year, contact_*) |
| 2 · Ubicación | `club_applications` (address, district, province, country, reference_note, parking, geo, geo_lat, geo_lng) |
| 3 · Canchas | `club_application_courts` (1..N) + `club_applications.weekly_hours` + `cancellation_policy` |
| 4 · Documentos | `club_application_documents` (4 kinds mínimo) + `club_application_photos` (4..6) |
| 5 · Revisión | `club_applications.terms_accepted_at`, `commission_pct`. **Trigger:** crear evento `submitted`, pasa `status=submitted` |
| Submitted | lectura: `club_application_events` para timeline |
| Approved | lectura: `clubs` recién creado vía `fn_materialize_club_from_application` |

### Autosave & resume

- Cada cambio del wizard hace `PATCH /api/v1/club-applications/:id` con un parcial Zod (validado por step pero todo opcional).
- `current_step` se actualiza solo al pasar de step válido.
- Cuando el user vuelve a entrar y no terminó, lo redirigimos a `/user/solicitar-club?app=<id>&step=<n>`.
- Solo puede existir **una** application en estado `draft` o `submitted/*review` por `applicant_id` (constraint a chequear vía partial unique index).

```sql
create unique index uq_one_active_app_per_applicant
  on club_applications (applicant_id)
  where status in ('draft','submitted','docs_review','field_verification','final_review');
```

### Notificaciones del flujo

Agregar al catálogo de `notifications`:

| Kind | Roles | Disparado por |
|---|---|---|
| `club_app.submitted` | `user`, `admin` | step 5 enviado |
| `club_app.docs_pending` | `user` | reviewer pide más docs |
| `club_app.field_scheduled` | `user` | admin agenda visita |
| `club_app.approved` | `user` | `fn_materialize_club_from_application` |
| `club_app.rejected` | `user` | reviewer rechaza |
| `club_app.review_needed` | `admin` | submitted nuevo en cola |

---

## 4. Dominio · courts

```sql
create table courts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  code text not null,                    -- 'C1','C2', mostrado en UI
  name text,
  sport mp_sport not null,
  surface text,                          -- 'clay','hard','synthetic','grass','panoramic'
  indoor boolean not null default false,
  lights boolean not null default true,
  active boolean not null default true,
  ordinal int not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (club_id, code)
);
create index idx_courts_club on courts (club_id);

create table court_pricing (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts(id) on delete cascade,
  day_of_week int check (day_of_week between 0 and 6),  -- null = todos
  starts_at time not null,
  ends_at time not null,
  price_cents int not null,
  duration_minutes int not null default 60,
  currency mp_currency not null,
  active boolean not null default true,
  check (ends_at > starts_at)
);
create index idx_court_pricing_court on court_pricing (court_id);

create table court_blocks (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts(id) on delete cascade,
  reason text not null,                  -- 'maintenance','event','closed'
  during tstzrange not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now() not null,
  exclude using gist (court_id with =, during with &&)  -- sin solapamiento
);
```

---

## 5. Dominio · reservations

```sql
create table reservations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  court_id uuid not null references courts(id),
  during tstzrange not null,
  status mp_reservation_status not null default 'booked',
  sport mp_sport not null,
  visibility mp_visibility not null default 'private',  -- public = quien quiera puede unirse
  max_players int not null default 4,
  notes text,
  organizer_id uuid not null references profiles(id),
  source text not null default 'app' check (source in ('app','walkin','admin','recurring')),
  cancellation_reason text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  cancelled_at timestamptz,
  -- evita doble-booking de la cancha
  exclude using gist (court_id with =, during with &&)
    where (status not in ('cancelled'))
);
create index idx_reservations_club on reservations (club_id, during);
create index idx_reservations_organizer on reservations (organizer_id);

create table reservation_participants (
  reservation_id uuid not null references reservations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  invited_by uuid references profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','removed')),
  joined_at timestamptz,
  primary key (reservation_id, user_id)
);

create table reservation_payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  user_id uuid references profiles(id),
  amount_cents int not null,
  currency mp_currency not null,
  method mp_payment_method not null,
  status mp_payment_status not null default 'pending',
  transaction_id uuid references transactions(id),
  created_at timestamptz default now() not null
);

create table walkins (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  court_id uuid references courts(id),
  customer_name text not null,
  customer_phone text,
  party_size int not null default 2,
  duration_minutes int not null default 60,
  created_reservation_id uuid references reservations(id),
  attended_by uuid references profiles(id),  -- employee
  notes text,                                -- nota libre del recepcionista (ver `032_role_gaps.sql`)
  sport mp_sport,                            -- deporte solicitado por el walk-in (ver `032_role_gaps.sql`)
  created_at timestamptz default now() not null
);
```

---

## 6. Dominio · checkins

```sql
create table check_ins (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references reservations(id),
  class_session_id uuid references class_sessions(id),
  user_id uuid references profiles(id),                -- null para walkins anónimos
  club_id uuid not null references clubs(id),
  method text not null check (method in ('qr','manual','auto')),
  scanned_by uuid references profiles(id),             -- employee
  scanned_at timestamptz default now() not null,
  check ( (reservation_id is not null) or (class_session_id is not null) )
);
create index idx_check_ins_club_time on check_ins (club_id, scanned_at desc);
```

---

## 7. Dominio · cash (POS)

```sql
create table cash_sessions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  opened_by uuid not null references profiles(id),
  opened_at timestamptz not null default now(),
  opening_float_cents int not null default 0,
  closed_by uuid references profiles(id),
  closed_at timestamptz,
  closing_counted_cents int,
  expected_cents int,
  variance_cents int,
  notes text,
  status text not null default 'open' check (status in ('open','closed','reconciled'))
);
create index idx_cash_sessions_club_open on cash_sessions (club_id) where status='open';

create table transactions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  cash_session_id uuid references cash_sessions(id),
  kind text not null check (kind in ('reservation','class','proshop_sale','event','tournament','custom')),
  ref_id uuid,                              -- id del recurso pagado (reservation_id, sale_id, etc.)
  customer_user_id uuid references profiles(id),
  customer_name text,                       -- para walkins sin user
  amount_cents int not null,                -- en céntimos; negativo = refund
  currency mp_currency not null,
  method mp_payment_method not null,
  status mp_payment_status not null default 'captured',
  provider text,                            -- 'stripe','mercadopago','manual'
  provider_payment_id text,
  receipt_url text,
  created_by uuid references profiles(id),  -- employee/coach
  created_at timestamptz default now() not null
);
create index idx_transactions_club_date on transactions (club_id, created_at desc);
create index idx_transactions_ref on transactions (ref_id);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  refund_transaction_id uuid references transactions(id),
  amount_cents int not null,
  reason text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null
);

create table cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references cash_sessions(id) on delete cascade,
  kind text not null check (kind in ('deposit','withdrawal','adjustment')),
  amount_cents int not null,
  reason text,
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null
);
```

---

## 8. Dominio · proshop

```sql
create table product_categories (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id),         -- null = catálogo global
  name text not null,
  slug text not null,
  ordinal int not null default 0,
  unique (club_id, slug)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id),         -- null = catálogo global
  category_id uuid references product_categories(id),
  sku text,
  name text not null,
  description text,
  price_cents int not null,
  currency mp_currency not null,
  stock int not null default 0,
  low_stock_threshold int not null default 5,
  active boolean not null default true,
  cover_url text,
  attributes jsonb default '{}',             -- {"color":"black","weight":"345g",...}
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique (club_id, sku)
);
create index idx_products_club_active on products (club_id) where active;
create index idx_products_name_trgm on products using gin (name gin_trgm_ops);

create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  delta int not null,
  reason text not null check (reason in ('purchase','sale','adjustment','return','damaged')),
  ref_id uuid,
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null
);

create table carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  club_id uuid references clubs(id),
  status text not null default 'active' check (status in ('active','checked_out','abandoned')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table cart_items (
  cart_id uuid not null references carts(id) on delete cascade,
  product_id uuid not null references products(id),
  qty int not null check (qty > 0),
  unit_price_cents int not null,
  primary key (cart_id, product_id)
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  customer_user_id uuid references profiles(id),
  cart_id uuid references carts(id),
  transaction_id uuid references transactions(id),
  total_cents int not null,
  currency mp_currency not null,
  sold_by uuid references profiles(id),     -- employee
  created_at timestamptz default now() not null
);

create table sale_items (
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  qty int not null,
  unit_price_cents int not null,
  primary key (sale_id, product_id)
);
```

### Function atómica (migration 039)

```sql
-- Reemplaza la secuencia client-side de 5 writes que tenía race condition
-- (dos ventas concurrentes leían el mismo stock cacheado en memoria del cliente).
-- Lockea cada producto con `for update`, valida stock, y aplica todos los
-- inserts/updates en una sola transacción Postgres.
create function fn_create_sale(
  p_club_id uuid,
  p_user_id uuid,
  p_customer_user_id uuid,
  p_customer_name text,
  p_method mp_payment_method,
  p_items jsonb  -- [{ product_id: uuid, qty: int }, ...]
) returns uuid  -- sale_id
language plpgsql security definer ...;

grant execute on function fn_create_sale(...) to authenticated;
```

**Codes mapeados:** `PROSHOP.OUT_OF_STOCK`, `PROSHOP.NOT_FOUND`, `PROSHOP.INACTIVE`, `PROSHOP.CLUB_MISMATCH`, `PROSHOP.CURRENCY_MIXED`, `PROSHOP.EMPTY`, `PROSHOP.INVALID_QTY`, `CASH.SESSION_CLOSED`, `AUTH.ROLE_REQUIRED`.

---

## 9. Dominio · coaches

```sql
create table coach_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  headline text,
  bio text,
  years_experience int,
  hourly_rate_cents int,
  currency mp_currency,
  intro_video_url text,
  verified_at timestamptz,
  verified_by uuid references profiles(id),
  rating_avg numeric(3,2),
  rating_count int not null default 0,
  primary_sport mp_sport,                      -- deporte principal del coach (ver `032_role_gaps.sql`)
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table coach_clubs (   -- M:N coach ↔ club
  coach_id uuid not null references coach_profiles(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  active boolean not null default true,
  commission_pct numeric(5,4) not null default 0.2000,  -- % que el coach paga al club por lecciones (default 20%, ver `032_role_gaps.sql`)
  joined_at timestamptz default now() not null,
  primary key (coach_id, club_id)
);

create table coach_specialties (
  coach_id uuid not null references coach_profiles(id) on delete cascade,
  sport mp_sport not null,
  specialty text not null,                 -- 'serve_volley','tactical','juniors','high_performance'
  proficiency int not null check (proficiency between 1 and 5),
  primary key (coach_id, sport, specialty)
);

create table coach_availability (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_profiles(id) on delete cascade,
  club_id uuid references clubs(id),
  day_of_week int not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (ends_at > starts_at)
);

create table coach_certifications (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_profiles(id) on delete cascade,
  name text not null,
  issuer text,
  issued_year int,
  document_url text,
  verified_at timestamptz
);

create table coach_reviews (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_profiles(id) on delete cascade,
  reviewer_id uuid not null references profiles(id),
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now() not null,
  unique (coach_id, reviewer_id)
);
```

---

## 10. Dominio · classes

```sql
create table classes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  coach_id uuid not null references coach_profiles(id),
  name text not null,
  description text,
  kind mp_class_kind not null,
  sport mp_sport not null,
  skill_level mp_skill_level,
  max_students int not null default 8,
  price_cents int not null,
  currency mp_currency not null,
  recurrence_rule text,                      -- RRULE (RFC 5545) o null
  active boolean not null default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_classes_club on classes (club_id);

create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  court_id uuid references courts(id),
  during tstzrange not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','completed','cancelled')),
  notes text,
  created_at timestamptz default now() not null,
  exclude using gist (court_id with =, during with &&) where (court_id is not null and status != 'cancelled')
);
create index idx_class_sessions_class_time on class_sessions (class_id, during);

create table class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id),
  status text not null default 'enrolled' check (status in ('enrolled','waitlist','cancelled','completed')),
  enrolled_at timestamptz default now() not null,
  paid_transaction_id uuid references transactions(id),
  unique (class_id, student_id)
);

create table class_session_attendance (
  class_session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references profiles(id),
  attended boolean,
  arrived_at timestamptz,
  primary key (class_session_id, student_id)
);

create table lessons_1on1 (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  court_id uuid references courts(id),
  coach_id uuid not null references coach_profiles(id),
  student_id uuid not null references profiles(id),
  during tstzrange not null,
  price_cents int not null,
  currency mp_currency not null,
  status mp_reservation_status not null default 'booked',
  paid_transaction_id uuid references transactions(id),
  notes text,
  created_at timestamptz default now() not null,
  exclude using gist (coach_id with =, during with &&) where (status not in ('cancelled')),
  exclude using gist (court_id with =, during with &&) where (court_id is not null and status not in ('cancelled'))
);
```

---

## 11. Dominio · students

```sql
create table student_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid not null references coach_profiles(id),
  skill text not null,                       -- 'forehand','backhand','serve','volley',...
  current_level int not null check (current_level between 1 and 10),
  target_level int check (target_level between 1 and 10),
  updated_at timestamptz default now() not null,
  unique (student_id, coach_id, skill)
);

create table student_evaluations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid not null references coach_profiles(id),
  class_session_id uuid references class_sessions(id),
  scores jsonb not null,                     -- {"technique":7,"tactics":6,...}
  summary text,
  created_at timestamptz default now() not null
);

create table student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id),
  coach_id uuid not null references coach_profiles(id),
  body text not null,
  visibility text not null default 'coach' check (visibility in ('coach','shared')),
  created_at timestamptz default now() not null
);
```

---

## 12. Dominio · resources

```sql
create table resources (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_profiles(id),
  club_id uuid references clubs(id),
  title text not null,
  description text,
  kind text not null check (kind in ('video','article','pdf','plan','exercise','link')),
  cover_url text,
  duration_seconds int,
  level mp_skill_level,
  tags text[] default '{}',
  visibility mp_visibility not null default 'private',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_resources_coach on resources (coach_id);
create index idx_resources_tags on resources using gin (tags);

create table resource_files (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  ordinal int not null default 0
);

create table resource_access (                -- a quién se le compartió
  resource_id uuid not null references resources(id) on delete cascade,
  user_id uuid references profiles(id),
  class_id uuid references classes(id),
  granted_by uuid not null references profiles(id),
  granted_at timestamptz default now() not null,
  check ( (user_id is not null) or (class_id is not null) )
);

create table resource_views (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  user_id uuid not null references profiles(id),
  progress_pct int not null default 0 check (progress_pct between 0 and 100),
  viewed_at timestamptz default now() not null
);
```

---

## 13. Dominio · messaging

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm','group','support','club_channel')),
  title text,
  club_id uuid references clubs(id),          -- null para DMs/groups cross-club
  created_by uuid not null references profiles(id),
  last_message_at timestamptz,
  created_at timestamptz default now() not null
);

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member','admin')),
  muted_until timestamptz,
  last_read_message_id uuid,
  joined_at timestamptz default now() not null,
  left_at timestamptz,
  primary key (conversation_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text,
  kind text not null default 'text' check (kind in ('text','image','file','system','reservation_invite')),
  payload jsonb,                              -- para invites estructurados
  reply_to_id uuid references messages(id),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz default now() not null
);
create index idx_messages_conv_time on messages (conversation_id, created_at desc);

create table message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes bigint
);

create table message_reads (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz default now() not null,
  primary key (message_id, user_id)
);
```

---

## 14. Dominio · friends

```sql
create table friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz default now() not null,
  responded_at timestamptz,
  check (from_user_id <> to_user_id),
  unique (from_user_id, to_user_id)
);

create table friendships (
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid not null references profiles(id) on delete cascade,
  since timestamptz default now() not null,
  primary key (user_a, user_b),
  check (user_a < user_b)                     -- canonicaliza par
);

create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  reason text,
  created_at timestamptz default now() not null,
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
```

---

## 15. Dominio · teams

```sql
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  sport mp_sport,
  logo_url text,
  captain_id uuid not null references profiles(id),
  club_id uuid references clubs(id),          -- opcional: team afiliado a un club
  -- Migration 036:
  privacy text not null default 'public' check (privacy in ('public','invite','private')),
  invite_code text unique not null default gen_team_invite_code(),
  created_at timestamptz default now() not null
);

create table team_members (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('captain','player','substitute')),
  joined_at timestamptz default now() not null,
  primary key (team_id, user_id)
);

create table team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  invited_user_id uuid not null references profiles(id) on delete cascade,
  invited_by uuid not null references profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz default now() not null,
  responded_at timestamptz,
  unique (team_id, invited_user_id)
);

-- Migration 037: solicitudes de unión a teams públicos/invite.
create table team_join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','cancelled')),
  message text,
  created_at timestamptz default now() not null,
  responded_at timestamptz,
  unique (team_id, user_id, status) deferrable initially deferred
);
```

### Funciones helper

```sql
-- Migration 036: genera códigos legibles XXX-XXXX-XXX sin O/0/I/1.
create function gen_team_invite_code() returns text language plpgsql ...;

-- Migration 037: transfiere capitanía bypaseando policy WITH CHECK
-- (la policy teams_captain_write bloquearía un UPDATE que cambia captain_id).
create function transfer_team_captain(p_team_id uuid, p_new_captain_id uuid)
  returns void language plpgsql security definer ...;
```

---

## 16. Dominio · ranking

```sql
create table match_results (
  id uuid primary key default gen_random_uuid(),
  sport mp_sport not null,
  played_at timestamptz not null,
  club_id uuid references clubs(id),
  reservation_id uuid references reservations(id),
  tournament_match_id uuid references bracket_matches(id),
  side_a jsonb not null,                       -- [{user_id, score_sets:[6,4], ...}]
  side_b jsonb not null,
  winner_side char(1) check (winner_side in ('a','b','d')),
  status mp_match_status not null default 'reported',
  reported_by uuid not null references profiles(id),
  confirmed_by uuid references profiles(id),
  confirmed_at timestamptz,
  disputed_reason text,
  created_at timestamptz default now() not null
);
create index idx_match_results_played on match_results (played_at desc);

create table player_stats (
  user_id uuid not null references profiles(id) on delete cascade,
  sport mp_sport not null,
  matches_total int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  current_rating int not null default 1500,
  peak_rating int not null default 1500,
  last_match_at timestamptz,
  updated_at timestamptz default now() not null,
  primary key (user_id, sport)
);

create table ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  sport mp_sport not null,
  rating int not null,
  rank_position int,
  snapshot_at timestamptz default now() not null,
  mode mp_match_mode  -- mig 130: serie por modo (singles vs doubles). Nullable.
);
create index idx_ranking_snapshots_user_sport on ranking_snapshots (user_id, sport, snapshot_at desc);
create index idx_ranking_snapshots_user_sport_mode on ranking_snapshots (user_id, sport, mode, snapshot_at desc);
-- mode-aware (mig 130): el chart de evolución separa singles/dobles. getUserRankingHistory
-- acepta `mode`; UserHome/RankingScreen piden por modo.
-- POBLADA desde mig 20260711000000: fn_process_ranking_snapshots() corre en el
-- cron diario `process-ranking-snapshots-daily` (06:00 UTC) e inserta 1 fila por
-- (user, sport, mode) solo cuando current_rating cambió desde el último snapshot.
-- rank_position solo para quienes cumplen fn_get_ranking_min_matches() (mig 116).
-- La misma mig hizo backfill retroactivo derivando la curva de matches.rating_deltas
-- (casuales, mig 065) + match_rating_applications (torneo) con reconstrucción
-- backward desde current_rating — el punto final siempre cuadra con player_stats.

-- vista materializada para listados rápidos
create materialized view mv_user_ranking as
  select ps.user_id, ps.sport, ps.current_rating, ps.wins, ps.losses,
         row_number() over (partition by ps.sport order by ps.current_rating desc) as rank
  from player_stats ps;
create unique index on mv_user_ranking (user_id, sport);
```

---

## 17. Dominio · tournaments (incluye leagues)

```sql
create table leagues (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references partner_orgs(id),
  name text not null,
  slug text unique not null,
  sport mp_sport not null,
  description text,
  cover_url text,
  season text,                                  -- 'Otoño 2026'
  status text not null default 'draft' check (status in ('draft','active','finished','archived')),
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references leagues(id) on delete set null,
  partner_id uuid references partner_orgs(id),
  club_id uuid references clubs(id),            -- venue principal
  name text not null,
  slug text unique not null,
  description text,
  cover_url text,
  sport mp_sport not null,
  format mp_tournament_format not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  status mp_event_status not null default 'draft',
  max_participants int,
  entry_fee_cents int not null default 0,
  currency mp_currency,
  prize_pool_cents int,
  rules_url text,
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_tournaments_starts on tournaments (starts_at);

create table tournament_categories (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,                           -- 'Open M','3ra F','Junior 16',...
  gender text check (gender in ('m','f','mixed','open')),
  level mp_skill_level,
  age_min int, age_max int,
  max_teams int
);

create table registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  category_id uuid references tournament_categories(id),
  team_id uuid references teams(id),
  player_ids uuid[] not null,                   -- dobles = 2 ids
  guest_names text[],                           -- walk-in: nombres libres; player_ids queda vacío (mig 20260704140000)
  registered_by uuid not null references profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn','waitlist')),
  paid_transaction_id uuid references transactions(id),
  created_at timestamptz default now() not null
);

create table brackets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  category_id uuid references tournament_categories(id),
  format mp_tournament_format not null,
  size int not null,                            -- 16, 32, ...
  generated_at timestamptz default now() not null,
  generated_by uuid references profiles(id)
);

create table bracket_matches (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references brackets(id) on delete cascade,
  round int not null,
  position int not null,                        -- 1..size/round
  side_a_registration_id uuid references registrations(id),
  side_b_registration_id uuid references registrations(id),
  scheduled_at timestamptz,
  court_id uuid references courts(id),
  status mp_match_status not null default 'scheduled',
  winner_side char(1) check (winner_side in ('a','b','d')),
  score jsonb,
  match_result_id uuid references match_results(id),
  unique (bracket_id, round, position)
);
create index idx_bracket_matches_bracket on bracket_matches (bracket_id, round, position);
```

---

## 18. Dominio · events

```sql
create table events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id),
  partner_id uuid references partner_orgs(id),
  organizer_id uuid not null references profiles(id),
  name text not null,
  slug text unique not null,
  description text,
  cover_url text,
  kind text not null check (kind in ('social','clinic','exhibition','party','league_meet','other')),
  status mp_event_status not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int,
  price_cents int not null default 0,
  currency mp_currency,
  visibility mp_visibility not null default 'public',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_events_starts on events (starts_at);

create table event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  paid_transaction_id uuid references transactions(id),
  status text not null default 'registered' check (status in ('registered','cancelled','attended','no_show')),
  created_at timestamptz default now() not null,
  unique (event_id, user_id)
);

create table event_check_ins (
  event_registration_id uuid primary key references event_registrations(id) on delete cascade,
  checked_in_at timestamptz default now() not null,
  checked_in_by uuid references profiles(id)
);
```

---

## 19. Dominio · notifications

```sql
create table notification_kinds (
  kind text primary key,
  description text not null,
  allowed_roles mp_role[] not null,             -- ['user','coach',...] o '{*}' implícito
  default_channels mp_notification_channel[] not null,
  category text not null,                       -- 'reservation','message','payment','tournament','system'
  created_at timestamptz default now() not null
);

create table notification_preferences (
  user_id uuid not null references profiles(id) on delete cascade,
  role mp_role not null,                        -- preferencias por rol activo
  kind text not null references notification_kinds(kind),
  channel mp_notification_channel not null,
  enabled boolean not null default true,
  primary key (user_id, role, kind, channel)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references profiles(id) on delete cascade,
  recipient_role mp_role not null,              -- el rol bajo el cual recibe esta notif
  kind text not null references notification_kinds(kind),
  title text not null,
  body text,
  payload jsonb not null default '{}',          -- {reservation_id, club_id, deep_link, ...}
  read_at timestamptz,
  created_at timestamptz default now() not null
);
create index idx_notifications_user_role_unread on notifications (recipient_user_id, recipient_role, created_at desc) where read_at is null;
create index idx_notifications_user_role on notifications (recipient_user_id, recipient_role, created_at desc);

create table notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz default now() not null,
  unique (user_id, endpoint)
);

create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null references notification_kinds(kind),
  channel mp_notification_channel not null,
  locale text not null default 'es',
  subject text,                                 -- para email
  body_template text not null,                  -- Handlebars-like {{var}}
  unique (kind, channel, locale)
);

create table notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role mp_role not null,
  kind text not null references notification_kinds(kind),
  channel mp_notification_channel not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempts int not null default 0,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz default now() not null
);
create index idx_notification_jobs_pending on notification_jobs (scheduled_for) where status='pending';
```

Preferencias:
- `notification_preferences` es sparse: si no hay fila, el canal queda
  habilitado únicamente cuando está en `notification_kinds.default_channels`.
- Para desactivar un canal se inserta/upsertea `enabled=false` por
  `(user_id, role, kind, channel)`.
- `fn_notification_preference_enabled(user, role, kind, channel)` centraliza el
  chequeo para `fn_enqueue_notification`, `fn_dispatch_inapp_notifications()` y
  workers de canal como `dispatch-email`.

### 19.1 Catálogo sembrado de `notification_kinds`

`033_seed_notification_kinds.sql` inserta el catálogo mínimo que consumen los dispatchers en `src/server/notifications/dispatch.ts`. El seed es idempotente (`on conflict (kind) do nothing`).

| Kind | Categoría | Roles destinatarios | Canales default |
|---|---|---|---|
| `role_request_new` | `roles` | `admin` | `inapp` |
| `role_request_approved` | `roles` | `user`, `partner`, `owner`, `manager`, `coach`, `employee` | `inapp`, `email` |
| `role_request_rejected` | `roles` | `user`, `partner`, `owner`, `manager`, `coach`, `employee` | `inapp`, `email` |
| `club_application_new` | `clubs` | `admin` | `inapp` |
| `club_application_approved` | `clubs` | `user`, `owner` | `inapp`, `email` |
| `club_application_rejected` | `clubs` | `user` | `inapp`, `email` |
| `club_application_status` | `clubs` | `user` | `inapp` |
| `reservation_created` | `reservations` | `user` | `inapp` |
| `reservation_cancelled` | `reservations` | `user` | `inapp` |
| `ticket_new` | `support` | `admin` | `inapp` |
| `ticket_assigned` | `support` | `admin` | `inapp` |
| `ticket_status_changed` | `support` | `user` | `inapp` |
| `friend_request_new` | `social` | `user` | `inapp` |

> Cuando se introduzca un nuevo `kind` en el código, agregarlo aquí **y** en un nuevo seed (`0NN_seed_notification_kinds_extra.sql`) — nunca editar 033 retroactivamente.

---

## 20. Dominio · marketing (broadcasts)

```sql
create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform','club','partner')),
  club_id uuid references clubs(id),
  partner_id uuid references partner_orgs(id),
  title text not null,
  body text not null,
  payload jsonb default '{}',
  channels mp_notification_channel[] not null default '{inapp}',
  target_filter jsonb not null default '{}',    -- {"role":"user","sport":"padel","city":"Buenos Aires"}
  scheduled_for timestamptz,
  sent_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','cancelled')),
  created_by uuid not null references profiles(id),
  created_at timestamptz default now() not null
);

create table broadcast_recipients (
  broadcast_id uuid not null references broadcasts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  notification_id uuid references notifications(id),
  opened_at timestamptz,
  primary key (broadcast_id, user_id)
);
```

**Despacho programado:** una campaña con `status='scheduled'` + `scheduled_for`
la despacha automáticamente el cron HTTP `/api/cron/dispatch-broadcasts`
(auth por `CRON_SECRET`), que reusa `executeBroadcastDispatch` de
`@/server/marketing/dispatch-broadcast-core` (mismo fan-out que el envío manual
`dispatchBroadcast`). Reclama la fila a `status='sending'` antes del fan-out
para evitar doble envío en corridas solapadas.

---

## 21. Dominio · moderation + audit

```sql
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id),
  entity text not null,                         -- 'profile','message','review','resource','club'
  entity_id uuid not null,
  reason text not null,
  details text,
  status mp_report_status not null default 'pending',
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz default now() not null
);
create index idx_reports_status on reports (status, created_at desc);

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id),
  target_user_id uuid references profiles(id),
  target_entity text,
  target_entity_id uuid,
  action text not null check (action in ('warn','remove_content','suspend','ban','restore','dismiss')),
  duration_hours int,                           -- para suspend
  reason text not null,
  performed_by uuid not null references profiles(id),
  performed_at timestamptz default now() not null
);

create table audit_log (
  id bigserial primary key,
  actor_id uuid references profiles(id),
  actor_role text,
  club_id uuid,
  entity text not null,
  entity_id uuid,
  action text not null,                         -- INSERT/UPDATE/DELETE o nombre de operación de dominio
  diff jsonb,
  ip inet,
  ua text,
  created_at timestamptz default now() not null
);
create index idx_audit_log_entity on audit_log (entity, entity_id, created_at desc);
create index idx_audit_log_club on audit_log (club_id, created_at desc);
create index idx_audit_log_actor on audit_log (actor_id, created_at desc);
```

---

## 22. Dominio · support

```sql
create table tickets (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                    -- TK-2026-0001
  club_id uuid references clubs(id),            -- null = ticket plataforma global
  opener_id uuid not null references profiles(id),
  assignee_id uuid references profiles(id),
  subject text not null,
  category text not null check (category in ('maintenance','system','customer','billing','other')),
  severity mp_ticket_severity not null default 'medium',
  status mp_ticket_status not null default 'open',
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_tickets_status on tickets (status, severity, created_at desc);

-- Cambios reales a estados user-facing (`in_progress`, `waiting_user`,
-- `resolved`, `closed`) encolan `ticket_status_changed` para el opener.

create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  author_id uuid not null references profiles(id),
  body text not null,
  internal boolean not null default false,      -- nota interna no visible al opener
  created_at timestamptz default now() not null
);

create table ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_message_id uuid not null references ticket_messages(id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes bigint
);
```

---

## 23. Dominio · feature-flags

```sql
create table feature_flags (
  key text primary key,
  description text not null,
  enabled_default boolean not null default false,
  rollout_pct int not null default 0 check (rollout_pct between 0 and 100),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table feature_flag_assignments (
  flag_key text not null references feature_flags(key) on delete cascade,
  scope text not null check (scope in ('user','club','role')),
  scope_id text not null,                       -- user_id/club_id/role
  enabled boolean not null,
  reason text,
  primary key (flag_key, scope, scope_id)
);
```

---

## 24. Dominio · partners

```sql
create table partner_orgs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  logo_url text,
  country text,
  contact_email text,
  status text not null default 'active' check (status in ('pending','active','suspended','archived')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table partner_members (
  partner_id uuid not null references partner_orgs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz default now() not null,
  primary key (partner_id, user_id)
);

create table partner_club_links (
  partner_id uuid not null references partner_orgs(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  revenue_share_pct numeric(5,2) not null default 0,
  linked_at timestamptz default now() not null,
  primary key (partner_id, club_id)
);
```

---

## 24.A. Dominio · payouts

> Liquidaciones periódicas a clubes, partners y coaches. Estructura Stripe Connect-ready: cada fila representa un payout consolidado en un rango `period_start..period_end`, con `gross / commission / net`, status que reusa `mp_payment_status`-style y referencias al provider externo. Ver `032_role_gaps.sql`.

Reglas clave:

- **Scope mutuamente excluyente:** un payout es `club`, `partner` o `coach`. El check constraint garantiza que solo el `*_id` correspondiente esté seteado y los otros dos sean `null`.
- **Idempotencia provider:** `provider` + `provider_payout_id` permiten reconciliar con Stripe/MercadoPago/etc.
- **Status:** `pending → approved → processing → paid` (camino feliz), o `failed`/`cancelled`.
- **Auditoría:** `created_by` + trigger `tg_set_updated_at` + `tg_audit` (por la pasada global de §25).

```sql
create table payouts (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('club','partner','coach')),
  club_id uuid references clubs(id),
  partner_id uuid references partner_orgs(id),
  coach_id uuid references profiles(id),
  period_start date not null,
  period_end date not null,
  gross_cents int not null,
  commission_cents int not null,
  net_cents int not null,
  currency mp_currency not null default 'USD',
  status text not null default 'pending'
    check (status in ('pending','approved','processing','paid','failed','cancelled')),
  provider text,                                     -- 'stripe','mercadopago','manual'
  provider_payout_id text,
  scheduled_for timestamptz,
  paid_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  check (
    (scope='club'    and club_id    is not null and partner_id is null and coach_id is null) or
    (scope='partner' and partner_id is not null and club_id    is null and coach_id is null) or
    (scope='coach'   and coach_id   is not null and club_id    is null and partner_id is null)
  )
);
create index idx_payouts_club    on payouts (club_id,    period_end desc) where club_id    is not null;
create index idx_payouts_partner on payouts (partner_id, period_end desc) where partner_id is not null;
create index idx_payouts_coach   on payouts (coach_id,   period_end desc) where coach_id   is not null;
create index idx_payouts_status  on payouts (status);
```

Ejemplo (payout mensual a un club):

```sql
insert into payouts (scope, club_id, period_start, period_end,
                     gross_cents, commission_cents, net_cents, currency, status, created_by)
values ('club', '...', '2026-04-01', '2026-04-30',
        1250000, 125000, 1125000, 'USD', 'pending', auth.uid());
```

---

## 24.B. Dominio · shifts

> Turnos de empleados, managers y coaches dentro de un club. Modelado con `tstzrange` y un `EXCLUDE` para impedir que el mismo usuario tenga dos turnos solapados (incluso entre clubes distintos, porque la persona física es una sola). Ver `032_role_gaps.sql`.

Reglas clave:

- **`during tstzrange`** + `exclude using gist (user_id with =, during with &&)` → si intentas insertar un turno cuyo rango choca con otro del mismo `user_id`, Postgres lo rechaza atómicamente. Esto evita doble-asignación y cubre el caso "el coach acepta clase en club A mientras tiene turno en club B".
- **Status lifecycle:** `scheduled → active → completed`, o `cancelled` / `no_show`.
- **Clock in/out:** `clocked_in_at` / `clocked_out_at` se llenan desde la pantalla de check-in del empleado. Pueden diferir de `lower(during)` / `upper(during)` (entró tarde, salió antes).
- **`role` restringido** a `employee`, `manager`, `coach` — admin/owner/user/partner no shiftean.

```sql
create table shifts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  user_id uuid not null references profiles(id),
  role mp_role not null check (role in ('employee','manager','coach')),
  during tstzrange not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','active','completed','cancelled','no_show')),
  clocked_in_at timestamptz,
  clocked_out_at timestamptz,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  exclude using gist (user_id with =, during with &&)   -- sin solapamiento por persona
);
create index idx_shifts_club_during on shifts using gist (club_id, during);
create index idx_shifts_user        on shifts (user_id, during);
```

> Si necesitas permitir solape (ej. on-call), agrega `where (status not in ('cancelled','no_show'))` al EXCLUDE en una migración futura. Hoy preferimos rigidez sobre flexibilidad.

---

## 24.C. Dominio · club_reviews

> NPS y rating cualitativo de socios al club. Diferente del `coach_reviews` (que mide al coach individual): aquí se mide la experiencia integral del club. Opcionalmente atado a una `reservation_id` para "review post-juego". Ver `032_role_gaps.sql`.

Reglas clave:

- **`rating` (1–5):** estrellas clásicas, requerido.
- **`nps` (0–10):** Net Promoter Score, opcional para no forzar dos métricas al user.
- **`reservation_id` opcional:** si la review nace del flow post-reserva, queda linkeada (permite "tu última reserva en este club"). Si nace de la ficha pública del club, queda en `null`.
- **Unique (`club_id`, `user_id`, `reservation_id`):** un usuario puede reseñar el club múltiples veces siempre y cuando sea por reservas distintas; review "general" (reservation_id null) es única por par (club, user).

```sql
create table club_reviews (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  nps smallint check (nps between 0 and 10),
  comment text,
  reservation_id uuid references reservations(id),
  created_at timestamptz default now() not null,
  unique (club_id, user_id, reservation_id)
);
create index idx_club_reviews_club on club_reviews (club_id, created_at desc);
```

### RPC bulk (migration 038)

```sql
-- Para listings de clubes: evita N+1 al traer avg+count por club.
-- Devuelve (0, 0) para clubes sin reviews.
create function get_club_review_stats(p_club_ids uuid[])
returns table (club_id uuid, avg_rating numeric, reviews_count bigint)
language sql stable as $$
  select c.club_id,
         round(coalesce(avg(r.rating)::numeric, 0), 2),
         count(r.id)
  from unnest(p_club_ids) as c(club_id)
  left join club_reviews r on r.club_id = c.club_id
  group by c.club_id;
$$;
```

---

## 25. Infraestructura común (último archivo de migración)

```sql
-- updated_at triggers en todas las tablas con esa columna
do $$
declare r record;
begin
  for r in
    select c.table_schema, c.table_name
    from information_schema.columns c
    where c.column_name = 'updated_at' and c.table_schema = 'public'
  loop
    execute format(
      'create trigger tg_%I_updated before update on %I.%I
       for each row execute function tg_set_updated_at();',
      r.table_name, r.table_schema, r.table_name);
  end loop;
end $$;

-- audit triggers (solo en tablas con datos de negocio, no en audit_log mismo)
-- (lista explícita para evitar loops y noise)
-- listado se consolidará en 99_audit_triggers.sql
```

---

## 26. Vistas y funciones de soporte

```sql
-- Disponibilidad de cancha entre dos fechas (consumida por GET /courts/:id/availability)
create or replace function fn_court_availability(p_court_id uuid, p_from timestamptz, p_to timestamptz)
returns table(slot_start timestamptz, slot_end timestamptz, available boolean)
language sql stable as $$
  -- genera bloques de 30min y marca ocupados por reservations + court_blocks + lessons_1on1
  -- implementación expandida en migración real
  select null::timestamptz, null::timestamptz, true where false;
$$;

-- Unread count por user × rol (para badge del bell)
create or replace view v_unread_notifications as
  select recipient_user_id, recipient_role, count(*)::int as unread
  from notifications
  where read_at is null
  group by recipient_user_id, recipient_role;
```

---

## 27. Tablas globales sin RLS estricta

| Tabla | Por qué |
|---|---|
| `notification_kinds` | catálogo público read-only para el cliente |
| `feature_flags` | catálogo, lectura para todos los autenticados |
| `audit_log` | solo admin lee, escritura por triggers (security definer) |

---

## 28. Resumen: total de tablas

**Núcleo (7):** 19 tablas + 5 del sub-dominio `club-applications`
**Coaching (4):** 14 tablas
**Social (3):** 9 tablas
**Competitivo (3):** 17 tablas
**Cross (6):** 21 tablas

**Total ≈ 85 tablas** + 1 vista materializada + 1 vista + funciones helper (incluye `fn_materialize_club_from_application`).

---

## 29. Tablas añadidas después del MVP (migrations 064+)

Cambios incrementales que el resto de la doc todavía no menciona. Cuando
implementes una feature que toque torneos, comisiones o payouts, **leé esta
sección antes** — la mayoría de los bugs vienen de no saber que estas
columnas/tablas ya existen.

### 29.1 · Stats split por modalidad (mig 064)

```sql
-- player_stats: pkey ahora (user_id, mode) en vez de user_id solo.
-- mode ∈ ('singles','doubles')
alter table player_stats add column mode text not null default 'singles';
alter table player_stats drop constraint player_stats_pkey;
alter table player_stats add primary key (user_id, mode);
```

### 29.2 · Tournaments — modalidad + scoring + ends_at nullable

```sql
-- migs 070, 073, 075-076
create type mp_tournament_modality as enum ('singles', 'doubles', 'mixed_doubles');

alter table tournaments
  add column modality mp_tournament_modality not null default 'doubles',
  add column scoring_config jsonb not null default
    '{"type":"side_out","points":11,"winBy":2,"bestOf":3}'::jsonb,
  add column is_featured boolean not null default false;
-- ends_at deja de ser NOT NULL — torneo de un solo día puede tener solo starts_at.
alter table tournaments alter column ends_at drop not null;
```

`scoring_config` shape:
```ts
{
  type: "side_out" | "rally",
  points: 11 | 15 | 21,
  winBy: number,    // típico 2
  bestOf: 1 | 3 | 5
}
```

Presets oficiales en `src/components/dashboard/partner/CreateTournamentFlow.tsx`
(constante `SCORING_PRESETS`): Trad BO3-11, Rally BO3-15, Rally 1-21, Trad
BO5-11, Popcorn (rally 15 BO1 con rotación de parejas).

### 29.3 · Tournament_categories — rating MPR

```sql
-- migs 075, 076 (DUPR → MPR rename)
alter table tournament_categories
  add column mpr_min numeric(3,2),
  add column mpr_max numeric(3,2),
  add constraint tc_mpr_range_chk check (
    (mpr_min is null or (mpr_min >= 2.0 and mpr_min <= 8.0)) and
    (mpr_max is null or (mpr_max >= 2.0 and mpr_max <= 8.0)) and
    (mpr_min is null or mpr_max is null or mpr_min <= mpr_max)
  );
```

**MPR = MATCHPOINT Rating** (escala 2.0-8.0). Rango abierto = open, sin
mpr_max = "5.5+", ambos null = sin filtro de nivel. Esto NO es DUPR aunque
la escala coincida — es naming propio de la plataforma.

### 29.4 · Tournament_prizes (mig 077)

```sql
create table tournament_prizes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  position int not null default 0,            -- orden de display
  place_label text not null,                  -- "1°", "Mejor remontada", etc
  prize_label text not null,                  -- "Trofeo + $500 + kit Selkirk"
  value_cents int,                            -- opcional para sumar prize pool
  sponsor text,                               -- opcional
  created_at timestamptz not null default now()
);
```

CRUD partner+admin (vía `requireTournamentEditor` en server actions, no RLS
directa para customer). Render en `PrizesPanel` + preview público.

### 29.5 · Tournament_schedule_blocks (mig 074)

```sql
create table tournament_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  category_id uuid references tournament_categories(id) on delete set null,
  starts_at timestamptz not null,
  label text not null,                        -- "Cat B fase grupos"
  notes text,                                 -- "Cancha 3-4"
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
```

Cronograma editable por partner. SELECT público (los jugadores ven la agenda),
mutación admin+partner via service role tras `requireTournamentEditor`.

### 29.6 · Platform_config (mig 080)

```sql
create table platform_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
```

Keys seedeadas:
- `take_rate_pct` (default 10) — % comisión MP sobre transacciones de torneo
- `estelar_price_cents` (default 2000) — costo de marcar torneo como estelar
- `refund_window_days` (default 7) — plazo de devolución tras cancelar

Helper en `src/server/queries/platform-config.ts` con cache TTL 1 min.

### 29.7 · Payouts (mig 081)

```sql
create type mp_payout_status as enum
  ('pending', 'processing', 'paid', 'failed', 'cancelled');

create table payouts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs(id) on delete set null,
  partner_id uuid references partner_orgs(id) on delete set null,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'USD',
  period_start date not null,
  period_end date not null,
  status mp_payout_status not null default 'pending',
  method text,                  -- 'transfer' | 'deuna' | etc
  reference text,                -- nro de comprobante
  notes text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references profiles(id),
  constraint payouts_recipient_chk check (
    (club_id is not null and partner_id is null) or
    (club_id is null and partner_id is not null)
  )
);
```

Hoy se insertan a mano al cerrar período. **Pendiente**: cron que los genere
automáticamente leyendo transactions `captured` y restando `take_rate_pct`.

### 29.8 · Coach_commissions (mig 082)

```sql
create table coach_commissions (
  coach_id uuid not null references coach_profiles(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  commission_pct numeric(5,2) not null check (commission_pct between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (coach_id, club_id)
);
```

Si no hay row para (coach, club) → fallback 20% hardcoded en
`CoachPagosScreen.tsx`. Reemplaza al `COMMISSION_PCT = 0.2` literal viejo.

### 29.8.b · Sponsors (mig 20260530155713)

Modelo mínimo productivo para `/dashboard/admin/admin-sponsors`:

```sql
create table sponsors (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  status text not null check (status in ('active','paused','archived')),
  website_url text,
  logo_url text,
  brand_color text,
  contact_name text,
  contact_email text,
  billing_email text,
  contract_starts_on date,
  contract_ends_on date,
  notes text
);

create table sponsor_slots (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  surface text not null,
  label text not null,
  max_active_placements int not null default 1,
  base_price_cents int not null default 0,
  is_active boolean not null default true
);

create table sponsor_placements (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references sponsors(id),
  slot_id uuid not null references sponsor_slots(id),
  status text not null check (status in ('draft','active','paused','archived')),
  headline text not null,
  target_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  contract_amount_cents int not null default 0
);

create table sponsor_placement_events (
  id bigint generated by default as identity primary key,
  placement_id uuid not null references sponsor_placements(id),
  event_type text not null check (event_type in ('impression','click')),
  occurred_at timestamptz not null default now()
);
```

Datos privados de sponsor (contacto, billing, notas) quedan en tablas admin-only.
La lectura pública pasa por `active_sponsor_placements`, una vista curada que solo
expone placements activos y campos de marca aptos para render.

### 29.8.c · Sales CRM (migs 171, 20260530203500)

`sales_leads` captura formularios públicos de ventas y ahora también sostiene
el pipeline mínimo de `/dashboard/admin/admin-ventas`:

```sql
create table sales_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  lead_type text not null check (lead_type in ('club','partner','coach','other')),
  business_name text,
  message text,
  source_url text,
  source_campaign text,
  status text not null default 'new' check (status in (
    'new','qualified','contacted','demo_scheduled','demo_completed',
    'pilot','proposal_sent','won','lost','nurture'
  )),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  owner_user_id uuid references profiles(id),
  next_follow_up_at timestamptz,
  last_contacted_at timestamptz,
  lost_reason text,
  notes text,
  city text,
  sport text,
  club_size text,
  monthly_events int,
  estimated_value_cents int,
  category text,
  target_city text,
  desired_inventory text,
  budget_range text,
  campaign_goal text,
  updated_by uuid references profiles(id),
  occurred_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

El endpoint público solo inserta con service role. La lectura y mutación del
pipeline son admin-only; `tg_audit_sales_leads` y `updated_by` preservan
trazabilidad.

### 29.8.d · Help CMS (mig 20260530161200)

Modelo mínimo productivo para `/dashboard/admin/admin-ayuda-guias` y el centro
del jugador `/dashboard/user/ayuda` / `ayuda-guias`:

```sql
create type help_article_status as enum ('draft','published','archived');
create type help_content_kind as enum ('article','video','glossary');

create table help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  category_key text not null,
  category_label text not null,
  icon text,
  status help_article_status not null default 'draft',
  content_kind help_content_kind not null default 'article',
  content jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  reading_minutes int not null default 3,
  video_url text,
  video_duration_label text,
  glossary_term text,
  is_featured boolean not null default false,
  view_count int not null default 0,
  helpful_count int not null default 0,
  not_helpful_count int not null default 0,
  search_vector tsvector generated always as (...) stored
);

create table help_article_revisions (...);
create table help_feedback (...);
create table help_search_logs (...);
```

La taxonomía inicial vive como constante TS (`HELP_CATEGORIES`) para no crear
una tabla editable antes de necesitarla. `help_articles.search_vector` tiene
GIN para búsqueda; `help_record_article_view(uuid)` incrementa vistas solo si
el usuario está autenticado y el artículo está publicado.

### 29.9 · Notification_kinds añadidos

Sumados a la tabla `notification_kinds` post-MVP:

| Kind | Migration | Disparador | Recipient |
|---|---|---|---|
| `tournament_rescheduled` | 045 | `updateTournamentByOrganizer` al cambiar fechas | inscritos pending+accepted |
| `tournament_cancelled` | 071 | `setTournamentStatus(cancelled)` y `cancelTournament` | inscritos pending+accepted |
| `registration_accepted` | 079 | `updateRegistrationStatus(accepted)` | jugadores del registration |
| `registration_rejected` | 079 | `updateRegistrationStatus(rejected)` | jugadores del registration |
| `payment_proof_rejected` | 079 | `rejectPaymentProofAdmin` | customer_user_id de la tx |

Branches del dispatcher en migs 050, 072, 079 (recreación incremental de
`fn_dispatch_inapp_notifications`). Catálogo completo en
`docs/guides/02-notifications.md` (cuando exista).

### 29.10 · Realtime publication

Tablas en `supabase_realtime` publication (migs 061, 078):

```
notifications, reservations, ranking_snapshots, player_stats,
tournaments, registrations, club_followers,
tournament_categories, tournament_schedule_blocks, tournament_prizes
```

Si agregas una tabla nueva que el cliente quiera escuchar, sumarla con:
```sql
alter publication supabase_realtime add table public.<tabla>;
```

### 29.11 · RPCs de performance (migs 100, 101)

Dos funciones SQL añadidas para eliminar N+1 y queries que traían el set completo solo para contar.

**`fn_unread_messages_count()`** (mig 100) — devuelve unread por conversación para `auth.uid()`.

```sql
returns table (conversation_id uuid, unread_count int)
language sql stable security invoker
```

Reemplaza el N+1 que vivía en:
- `[role]/layout.tsx` (badge `chat` del rol user) — antes: 3 queries secuenciales con traída completa de message ids.
- `src/components/dashboard/user/MensajesScreen.tsx` — antes: `Promise.all(convIds.map → count(*))`.

Llamado con `supabase.rpc("fn_unread_messages_count")`. RLS aplica vía `security invoker`.

**`fn_unique_organizers_count(p_club_id uuid)`** (mig 101) — count(distinct organizer_id) de reservations de un club.

```sql
returns int
language sql stable security invoker
```

Reemplaza el patrón `select organizer_id, count: exact, head: false` en `[role]/layout.tsx` para owner/manager que traía TODAS las filas históricas del club solo para hacer distinct en memoria.

### 29.12 · Teams caps por plan (mig 102)

Primer feature con gating real detrás de MP+. Ver `docs/product/00-matchpoint-plus.md §7.1`.

**Cambios**:
- `teams.rename_count int not null default 0` — contador de renames del nombre. Free cap: 2, MP+ cap: 5.
- `platform_config` key `team_caps` con JSON `{ free: {...}, premium: {...} }` con los 3 caps (roster, pendingInvites, renames). `pendingInvitesMax: null` significa ilimitado.
- `fn_get_team_caps()` SECURITY DEFINER → cualquier authenticated puede leer el JSON sin pegar a la tabla directa (RLS de `platform_config` solo permite admin).

**Llamado desde**: `src/lib/teams/caps.ts` (`getTeamCaps(captainProfile)`), reusado en 7 server actions de `teams.ts` (`createTeam`, `inviteToTeam`, `joinTeamByCode`, `acceptTeamInvite`, `respondToJoinRequest`, `updateTeam`, `transferCaptain`).

### 29.13 · Sistema de mensajes (migs 104-106)

Perfil oficial "MATCHPOINT" + team chats sincronizados + welcome DMs.

**Cambios de schema (mig 104)**:
- `profiles.is_system bool not null default false` — flag para el perfil oficial. RLS RESTRICTIVE bloquea edit/delete via JWT (service role bypassa).
- `conversations.kind` extiende check constraint con `'team_channel'`.
- `conversations.team_id uuid references teams(id) on delete cascade` — solo populado para `kind=team_channel`. Index `idx_conversations_team`.
- Seed del system user en `auth.users` + `profiles`, UUID guardado en `platform_config.system_user_id`.
- `platform_config.system_messages_enabled` (default `true`) — killswitch global.

**Exclusiones de rating/leaderboard (mig 107)**:
- `profiles.display_name` del system user = `'MATCHPOINT'` (uppercase, marca).
- Trigger `tg_seed_player_stats` skipea `is_system` → no se generan rows de rating.
- RLS RESTRICTIVE en `player_stats` y `ranking_snapshots` bloquea inserts cuando `is_system = true` → defensa contra otros paths.
- Rows previas borradas (6 player_stats que se habían auto-seedeado antes del fix).
- Resultado: el perfil oficial **no aparece** en `/ranking`, podium, top-N, ni feeds derivados.

**Funciones nuevas**:
- `fn_get_system_user_id()` SECURITY DEFINER → cualquier authenticated lee el UUID (sirve para badge verified en MensajesScreen).
- `fn_send_system_message(p_recipient_user_id, p_body, p_payload)` (mig 105) SECURITY DEFINER → encuentra/crea DM entre system user y recipient, inserta message con `kind='system'`. Bypassa `messages_member_insert` RLS que requiere `sender_id = auth.uid()`. Respeta killswitch.

**Triggers (mig 106)**:
- `tg_team_channel_create` AFTER insert teams → crea conversation `team_channel` + agrega captain como admin.
- `tg_team_member_join_channel` AFTER insert team_members → agrega user a conversation_members (reactiva si había left_at).
- `tg_team_member_leave_channel` AFTER delete team_members → marca `left_at` en conversation_members (preserva historial).
- Disband team → cascade FK borra conversation.

**Llamadores TS**:
- `src/lib/messages/system.ts` — `sendSystemMessage()` helper + `WELCOME_TEMPLATES` hardcoded (placeholder hasta mover a platform_config).
- `signUp` → `welcome_signup` DM.
- `createTeam` → `welcome_team_created` DM (además del team_channel auto del trigger).
- `saveOnboardingStep` (step='finish') → `welcome_onboarding_completed`.
- `approvePlanSubscriptionAdmin` → `welcome_premium_activated`.

### 29.15 · Sistema anterior de personalización de perfil — retirado

Las migraciones 113-129 introdujeron una V1 de personalización de perfil con
columnas en `profiles`, catálogo de paquetes, grants y controles admin. Ese
sistema fue retirado por una migración posterior de reset: las columnas de
perfil, tablas de catálogo/grants/settings, rutas, actions y flags asociados
ya no forman parte del contrato vivo.

El nuevo sistema de personalización queda pendiente de diseño. Cuando se
defina, debe crearse con migraciones nuevas y actualizar esta sección con el
schema vigente, RLS, realtime y superficies de UI.

### 29.14 · Team MPR computado on-the-fly (sin tabla nueva)

El team NO tiene rating propio en DB todavía. Mientras no exista la mecánica
de matches team-vs-team (Arena / retos / juegos intra-team — fases
siguientes), el "Team MPR" se computa sobre la marcha desde `player_stats`
de los miembros del roster.

**Helper**: `src/lib/teams/mpr.ts` → `computeTeamMpr(rows)`.

**Fórmula**: `weighted_avg(current_rating, weight = matches_total + 1)`.
- El +1 evita que miembros con 0 matches queden sin voz.
- Miembros con más experiencia pesan más en el rating del team.

**Sport/mode**:
- Sport: `teams.sport` (fallback `pickleball` si `null` o `multi`).
- Mode: `'doubles'` (típico para teams; player_stats está particionado por
  mode desde mig 064).

**Exclusiones**:
- `profiles.is_system = true` no tiene `player_stats` (mig 107), así que
  queda fuera natural. No requiere filtro extra.

**Display**:
- Escala interna 1500-base. Render dividiendo `/1000` con 2 decimales → `"4.20"`.
- `null` = team sin miembros con stats (recién creado, o sin matches en el
  sport+mode pedido). UI muestra `"—"`.

**Caller actual**: `src/components/dashboard/user/TeamScreen.tsx` (server
component) → pasa `teamMpr` al `TeamScreenView` que lo renderiza en el
header al lado de victorias/derrotas/winrate.

**Migración futura** a tabla `team_stats` cuando se agregue Arena:
mantener la fórmula como fallback inicial; una vez que el team tenga
matches propios, `team_stats.current_rating` se actualiza vía trigger
(análogo a `tg_update_player_stats` que ya existe para player matches).

### 29.17 · Busco partido / match seeks (migs 117–120)

Tablón LFG. Ver doc de producto `docs/product/03-match-seeks.md`.

- **`match_seeks`** (mig 117): `created_by`, `sport`, `mode` (reusa
  `mp_match_mode`), `partner_id` (obligatorio en doubles vía check
  `match_seeks_partner_by_mode`), `city` (snapshot del autor), `club_id`,
  `skill_min`/`skill_max numeric(3,1)`, `ranked`, `window_start`/`window_end`,
  `notes`, `status mp_match_seek_status` (`open|matched|expired|cancelled`),
  `match_id` (FK al match creado), `expires_at`. Trigger `tg_set_updated_at`.
- **`match_seek_applications`** (mig 117): `seek_id`, `applicant_id`,
  `partner_id`, `status` (`pending|accepted|rejected|withdrawn`), `message`.
  Unique `(seek_id, applicant_id)`.
- **RLS**: patrón espejo de `team_join_requests` — seek `open` legible por
  todos, mutado solo por `created_by` o admin; aplicación legible por
  applicant/partner/owner-del-seek.
- **Audit**: `tg_audit` en ambas tablas.
- **Chat (mig 118)**: `conversations.kind` suma `'match'` + columna
  `match_id` (FK cascade). Trigger `fn_create_match_channel` AFTER INSERT on
  `matches` crea la conversación y suma a todos los `team_a/team_b` player_ids.
  Aplica a **todos** los matches, no solo los del tablón.
- **Notif (mig 119)**: kinds `match_seek_applied`, `match_seek_accepted`
  (categoría `matches`) + branch en `fn_dispatch_inapp_notifications`.
- **Flag/config (mig 120)**: `feature_flags.match_seeks_enabled` (default
  false); `platform_config.match_seek_expiry_days` (7) y
  `match_seek_max_open_per_user` (5).

### 29.18 · Ciclo de vida de matches (migs 121–122)

Ver `docs/product/04-matches-lifecycle.md`.

- **`matches`** (mig 121): `+cancelled_by`, `+cancelled_reason`,
  `+cancelled_at`. Sumada al publication realtime.
- **Actions** (`matches.ts`): `cancelMatch` (status→cancelled, notif, reabre el
  `match_seek` de origen vía service role si no expiró), `rescheduleMatch`
  (update `played_at` + notif). `acceptApplicant` (match-seeks) **dejó de
  auto-rechazar**: los demás postulantes quedan `pending`.
- **Notif** (mig 122): `match_cancelled`, `match_rescheduled` + branches en
  el dispatcher (link al chat del partido vía `conversation_id`).

### 29.19 · No-show + fiabilidad (mig 124, flag OFF)

Ver `docs/product/04-matches-lifecycle.md`. Detrás de `match_reliability_enabled`.

- **`player_reliability`** (`user_id` PK, `no_shows`, `cancellations`) — score
  computado en `src/lib/reliability.ts`. SELECT público (badge), write admin.
- **`match_no_shows`** (`match_id`, `reported_by`, `no_show_user_id`) — unique
  por reporter+match+no-show, check no-self. SELECT participantes/admin, insert
  admin-only (la action `reportNoShow` usa service role tras validar).
- **Notif** `match_no_show_reported` + branch dispatcher.
- Ambas con `tg_audit`.

### 29.20 · Personalización por temas — retirada

El rediseño por temas que vivía sobre la V1 también quedó retirado. Ya no hay
catálogo de temas activo, overrides de temas ni actions admin para activar o
desactivar estilos. Esta sección se conserva solo como marcador histórico:
cualquier personalización nueva debe documentarse como un diseño nuevo, sin
depender del esquema anterior.

### 29.21 · Quedadas — juego social (mig 131, Stage 1)

Entidad social casual, distinta de torneos. Un user organiza una junta con un
formato (`mp_quedada_format`: americano/mexicano/round_robin/kotc/canguil/libre),
abierta (cuota + cupo) o privada (invitación). v1 = organizar + resultados
casuales; ranked + stats por formato×modo + motor en vivo + chat = v2.

- `quedadas`: creator_id, club_id?(sede), reservation_id?, title, format,
  `match_mode` (singles/dobles, para v2 stats), visibility (open/private),
  status (reusa `mp_event_status`), starts_at, fee_cents, perks_text, ranked
  (v1 siempre false). RLS: select abiertas público / privadas creator+invitados;
  write del creator (o admin).
- `quedada_participants`: PK(quedada_id,user_id), status
  (joined/waitlist/invited/cancelled), paid_transaction_id?, points/final_rank
  (standings casuales que ingresa el organizador, NO tocan MP Rating en v1).
  RLS: self + el creador puede insertar 'invited' de otros. **En el publication
  realtime** (cupos en vivo) junto con `quedadas`.
- `quedada_reports`: soporte/moderación (admin resuelve).
- Pagos: cuota abierta → `transactions` kind=`quedada` (constraint ampliado) +
  flujo de comprobante existente. **Sin payout** (el organizador maneja el dinero;
  payout real diferido hasta convenio con banco/procesador).
- Notif kinds: `quedada_invite/joined/reminder/cancelled` (seed mig 131).
- Actions: `src/server/actions/quedadas.ts` (create/join/leave/invite/cancel/
  setResults/report) + `admin/quedadas.ts` (list/cancel + reportes, con
  `setAuditActor`). Tablas aún no en tipos generados → cliente `as any` (deuda a
  limpiar regenerando `db/types.ts`).

**Panel de gestión v1.x (mig 133):** `quedada_categories` (nivel/horario/cancha/
cupo por categoría), `quedada_pairs` (slot_no + player_a/b, jugadores REGISTRADOS,
unique category+slot), `quedada_cohosts`. `quedadas` +`courts_count`/`hours`/
`court_price_cents` (costo = canchas×horas×precio), +`payment_info`/`prizes_text`,
+`invite_code` (único, default `gen_quedada_invite_code()` — link de inscripción).
`quedada_participants` +`paid`. RLS: categorías/cohosts/logística = solo creador;
parejas/slots/`paid` = creador O co-host (helper `mp_quedada_can_manage`,
SECURITY DEFINER). Recursión RLS rota con helpers definer (mig 132). Actions de
gestión en `quedadas.ts` (cohosts/categorías/pairs/paid/logística/joinByInviteCode).
Notif kind `quedada_cohost_added`.

**Asignación de parejas — dos modos:** (1) **elegidas** (manual): el picker en
gestión ofrece SOLO inscritos `joined` no asignados aún en la categoría (selects,
no búsqueda global); (2) **al azar (popcorn)**: action `autoAssignCategory`
(schema `AutoAssignCategorySchema`) mezcla (Fisher–Yates) los inscritos
disponibles y llena los cupos vacíos (2/cupo en dobles, 1 en singles), insertando
`quedada_pairs`. RLS = `mp_quedada_can_manage` (policies existentes), sin schema
nuevo.

**Ciclo de cierre (lifecycle):** estados `mp_event_status`. El panel de gestión
(header, solo creador) transiciona: `registration_open` →(Cerrar inscripciones)→
`registration_closed` →(Iniciar)→ `live` →(Resultados)→ `finished`; `Reabrir`
vuelve a `registration_open`; `Cancelar` → `cancelled`. Action `setQuedadaStatus`
(schema `SetQuedadaStatusSchema`, creador) para closed/live/reopen; `finished`
se setea vía `setQuedadaResults` (puestos por categoría: el organizador ordena
las parejas, `final_rank` se escribe a ambos jugadores de la pareja; casual, NO
toca MP Rating). Tab **Resultados** (creador, visible cuando status ≥ closed) y
**podio** en Resumen cuando `finished`. El viejo `ResultsModal` (flujo plano en
las tarjetas) fue removido; resultados viven en la página de gestión.

**Motor de juego (rediseño, mig 141 — reemplaza migs 137–140):** se borró el
motor viejo (molde único `grupos→bracket` con parejas fijas, tabla
`quedada_matches`) y se reemplazó por un modelo **player-céntrico** + **motor por
formato**. Los formatos activos (`americano`, `mexicano`, `round_robin`, `kotc`,
`canguil`, `libre`) escriben en las mismas tablas; el engine solo decide
emparejamiento y standings. Tablas nuevas:

- `quedada_rounds` (quedada_id, category_id, round_no, status
  scheduled|active|done) — orquesta cada ronda de una categoría. unique
  (category_id, round_no).
- `quedada_games` (quedada_id, category_id, round_id, round_no, court_no?,
  **lados a nivel jugador**: side_a_p1, side_a_p2?, side_b_p1, side_b_p2?,
  points_a?, points_b?, status scheduled|played). p2 null = singles. Un game
  NO referencia `quedada_pairs` porque la "pareja" es efímera por ronda.
- `quedadas`/`quedada_categories` +`target_points` (largo del partido a X
  puntos; fallback categoría → quedada → 24).

**Engines:** registry en `src/lib/quedadas/engines/`. Americano, Mexicano y
Canguil usan roster/tabla individual; Round Robin y KOTC usan pareja cuando el
modo es dobles; Libre crea partidos manuales. Standings DERIVADOS (append-only)
de los games played (`standings.ts` / `pair-standings.ts`). Actions:
`generateQuedadaRound` (siguiente ronda/fecha/turno), `createManualQuedadaGame`
(Libre), `reportGame`, `deleteRound` (regenera), `finishQuedada` (podio según
engine → `final_rank`). `generateAmericanoRound` queda como alias temporal. RLS:
read = miembro/abierta/can_manage/admin; write = can_manage/admin (helpers
existentes). En `supabase_realtime`. `getQuedadaManageData` devuelve
`rounds`+`games`+target.

**Vista del jugador (read-only):** la ruta `/dashboard/[role]/quedada/[id]`
bifurca (client `QuedadaPageRouter` lee `canManage`): organizador →
`QuedadaManagePanel`; jugador → **`QuedadaDetailView`** (pantalla completa). Ambas
montan el componente compartido **`QuedadaGameView`** (calendario + tabla general;
organizador con controles, jugador sin). Lectura del jugador =
`getQuedadaPlayerView` (anti-leak: sin invite_code/cohosts/payment_account).

**UI panel:** una sola sub-tab **Juego** (`QuedadaGameView` con `canManage`):
calendario de partidos (scoreboard por cancha, byes) + tabla general según engine
para todos los formatos.

**Walk-ins (mig 20260722000000):** tabla `quedada_guests` (id uuid, quedada_id,
display_name, paid, checked_in_at/by, created_by) — jugadores SIN cuenta que el
organizador agrega a mano y que **juegan**: ocupan cupos en `quedada_pairs` y
lados en `quedada_games` con su UUID. Para permitirlo, las FKs directas a
`profiles` de `quedada_pairs.player_a/b_id` y `quedada_games.side_*` se
reemplazaron por triggers de validación (`mp_quedada_player_ref_ok`: el id debe
existir en `profiles` O en `quedada_guests` de la MISMA quedada). Al borrar un
guest, un trigger limpia sus cupos (igual que `leaveQuedada`); la action
`removeQuedadaWalkIn` bloquea el borrado si ya tiene games
(`QUEDADAS.WALKIN_LOCKED`). RLS: read = quien ve la quedada; write =
`mp_quedada_can_manage`/admin. Con `tg_audit` y en `supabase_realtime`. Actions:
`addQuedadaWalkIn`/`removeQuedadaWalkIn`/`setGuestPaid`/`setGuestCheckedIn`.
Los guests cuentan para el cupo (joinQuedada, tarjetas), entran a
`autoAssignCategory` y a los standings; el aviso de pago NO les aplica (sin
cuenta → sin notifs). Ojo: se pierde el cascade profile→games (profiles casi
nunca se borran; el cascade por quedada_id sigue intacto).

**Realtime en gestión:** las tablas (`quedadas`, `quedada_participants`,
`quedada_guests`, `quedada_categories`, `quedada_pairs`, `quedada_rounds`, `quedada_games`) están en `supabase_realtime`. El panel
(`QuedadaManagePanel`) usa `useRealtimeRefresh` en modo `onChange` (datos
client-side vía `getQuedadaManageData` → refetchea con `reload()`, no
`router.refresh`), filtrando por `quedada_id`/`id`, debounce 400ms. Creador +
co-hosts ven en vivo parejas/cupos/pagos que cambia el otro.

**Datos de organización estructurados (mig 134):** `quedadas` +`payment_account`
jsonb `{bank, accountType: ahorros|corriente, accountNumber, holderName,
holderId?, note?}` + `prizes` jsonb `[{place, prize, valueCents?}]`. Reemplazan
el texto libre `payment_info`/`prizes_text` (deprecados, quedan por compat). El
banco se elige de un catálogo estático EC (`src/lib/geo/ec-banks.ts`). Mismos
editores (`BankAccountFields`/`PrizesEditor`) en wizard de crear y panel de
gestión. RLS sin cambios (columnas de `quedadas`). "Duplicar" precarga el wizard
desde una quedada previa (reusa `getQuedadaManageData`, sin storage nuevo). El
inscrito que paga la cuota ve el banco en `/pagos/[txId]`: `getPaymentProofForUser`
resuelve `kind=quedada` → `refLabel` (title) + `paymentAccount`, y `PaymentProofView`
muestra la tarjeta "Datos para transferir".

**Check-in + aviso de pago (mig 144–145):** `quedada_participants` +`checked_in_at`/
`checked_in_by` (asistencia informativa, NO bloquea motor ni pago) +`payment_reminded_at`
(cooldown 30min del aviso). Index parcial `idx_quedada_participants_checked_in`.
RLS sin cambios (la cubre `qp_update` = self/can_manage/admin). Notif kind
`quedada_payment_reminder` (mig 145, seed + branch en dispatcher). Actions:
`setParticipantCheckedIn`/`setAllCheckedIn` (check-in), `remindQuedadaPayment`
(notif inapp + DM sistema a pendientes, admin+`setAuditActor`),
`getMyQuedadasFinanceStats`/`getQuedadaPlayerHistory` (stats read-only scoped a
`creator_id`). Ver `docs/product/06-quedadas.md`.

**Edición de configuración (mig 146):** notif kind `quedada_rescheduled` (seed +
branch dispatcher). Sin columnas nuevas (title/description/starts_at/location_text/
visibility/max_players/perks_text/engine_mode/target_points ya existen). Actions:
`updateQuedadaDetails` (creador; edita generales, NO formato/modo; reprograma →
notif a joined), `regenerateInviteCode` (creador; RPC `gen_quedada_invite_code`),
`updateQuedadaLogistics` +`engineMode` (guard `QUEDADAS.ENGINE_LOCKED` si ya hay
games). Ver `docs/product/06-quedadas.md`.

**Plantillas (mig 135):** `quedada_templates` (user_id, name, config jsonb,
created_at) — snapshot del wizard (QuedadaInitial sin fecha) para repetir armados.
Data privada del usuario: RLS = dueño (`user_id = auth.uid()` en select/insert/
update/delete), sin audit/realtime/path admin (config personal, no entidad
moderable). Cap **5/usuario** validado en `saveQuedadaTemplate`. Actions
`listQuedadaTemplates`/`saveQuedadaTemplate`/`deleteQuedadaTemplate` + UI en el
wizard (chips de carga + "Guardar actual").

### 29.22 · Membresías VIP por club (migs 147–150)

Membresías de pago **por club** (distinto de MATCHPOINT+ = premium plataforma, y
de `club_followers` = seguir gratis). Espejo de `player_subscriptions`.

- `club_membership_tiers` (club_id, name, description, price_cents,
  duration_months, discount_pct, benefits jsonb, card_design jsonb
  {templateKey, accent?}, sort_order, is_active). RLS: select activos/staff,
  write `mp_club_staff`.
- `club_memberships` (club_id, user_id, tier_id, status
  pending|active|expired|cancelled|rejected, member_no correlativo por club,
  starts_at, expires_at, transaction_id, cancelled_reason). **Unique
  (club_id,user_id)** — una fila por club que se renueva extendiendo expires_at.
  RLS: select propio/staff, mutación staff (admin client + setAuditActor en
  aprobación). En `supabase_realtime`. Audit triggers en ambas.
- `transactions.kind` += `club_membership` (ref_id = membership). El comprobante
  lo aprueba el **owner/manager** (`approveClubMembership`), no el admin;
  `listPendingProofsAdmin` excluye este kind.
- Notif kinds (mig 148): `club_membership_requested/activated/expiring_soon`.
- Cron (mig 149): `fn_process_club_memberships` (expira + avisa ≤7d).
- Helper `isClubMembershipActive` + catálogo de tarjetas en
  `src/lib/clubs/membership.ts`. Ver `docs/product/07-club-memberships.md`.

### 29.24 · Moderación admin de teams (migs 165-166)

Completa el pipeline de governance del admin sobre teams de usuarios. Habilita
todos los row-actions del rediseño `AdminUserTeamsScreen`.

**Schema mig 165** (status + flags admin):

- `teams.status text not null default 'active' check (active|suspended|archived)` + `idx_teams_status`.
- `teams.is_verified boolean not null default false` (badge azul).
- `teams.is_pinned boolean not null default false` + index parcial (pinned va primero en discovery).
- Trigger `fn_teams_protect_admin_fields` BEFORE UPDATE: revierte cambios de los
  3 campos cuando `auth.uid() is not null` (cualquier caller con sesión). Solo
  service-role los puede tocar.

**Schema mig 166** (cola de reportes):

- `team_reports (id, team_id, reporter_user_id, kind in name|captain|ghost|logo|other, detail, status in open|dismissed|actioned, created_at, resolved_at, resolved_by, resolution)`.
- RLS: `tr_authn_insert` (cualquier authenticated reporta), `tr_own_select` (reporter ve los suyos), mutación admin via service-role.
- `tg_audit_team_reports` AFTER insert/update/delete.

**Notif kinds nuevos (mig 166)**:

- `team_reported` (admin) — dispatch fan-out al insertar reporte.
- `team_report_resolved` (reporter).
- `team_suspended`, `team_archived`, `team_reactivated`, `team_dissolved_by_admin` (a miembros).
- `team_admin_message` (al captain) — para DM single/bulk del admin.

**Server actions**:

- `src/server/actions/admin/teams.ts`: `setTeamStatusAdmin`, `setTeamVerifiedAdmin`,
  `setTeamPinnedAdmin`, `forceTransferCaptainAdmin`, `adminDissolveTeam`,
  `sendAdminDmToCaptain`, `bulkAdminDmToCaptains`, `bulkSetTeamStatusAdmin`. Todas
  con `setAuditActor("admin")`. `forceTransferCaptainAdmin` valida que el destino
  sea miembro + no sea captain de otro team (regla 1/1).
- `src/server/actions/team-reports.ts`: `reportTeam` (user), `resolveTeamReport`
  (admin), `listOpenTeamReportsServer` (helper para server component).

**Broadcasts**: `TargetFilter` en `src/server/actions/marketing.ts` ahora soporta
`audience: 'team_captains'` (resuelve via `teams.captain_id` con `status='active'`).
La pantalla `AdminUserTeamsScreen` lo invoca como bulk DM kind=`team_admin_message`
(no usa broadcasts directamente; ya tenemos fan-out via notification_jobs).

**Sync cross-superficie**:

- `loadPublicTeams` (TeamScreen.tsx) filtra `status='active'` y ordena `is_pinned desc`.
- `TeamHome` muestra badge verified en hero + banner status para suspended/archived.
- `TeamJoin` cards muestran iconos verified+pinned y botón "Reportar este team" (modal `reportTeam`).

### 29.23 · Team settings + achievements (mig 164)

Convierte en funcionales los toggles de "Roles y permisos" del `TeamSettings`
y la card "Logro reciente" del `TeamHome`, que antes eran 100% hardcoded.

**Schema (mig 164)**:

- `teams` += 4 cols boolean (todas `not null` con defaults que respetan el
  comportamiento previo):
  - `captain_only_invites bool default true`
  - `require_join_approval bool default true`
  - `show_in_ranking bool default true`
  - `allow_external_chat_guests bool default false`
- `team_achievements` (id, team_id, kind, title, subtitle, awarded_at,
  awarded_by, metadata jsonb). RLS: SELECT cualquier authenticated; sin
  policy de INSERT/UPDATE/DELETE → solo admin via service-role
  (`getAdminClient` + `setAuditActor`). Audit trigger `tg_audit_team_achievements`.

**Enforce parcial**: solo `require_join_approval` está cableado hoy. Si está
en `false` y el team NO es `private`, `requestJoinTeam` auto-inserta a
`team_members` + dispara notif `team_member_joined` al captain. Los otros 3
toggles persisten en DB pero NO cambian comportamiento — la UI los marca con
badge "Pronto" hasta que existan:

- `captain_only_invites` → necesita co-capitanes (rol no existe en el enum `team_members.role`).
- `show_in_ranking` → necesita ranking de teams (hoy `mv_user_ranking` es solo de users).
- `allow_external_chat_guests` → necesita chats team-vs-team (Arena).

Ver `docs/guides/04-placeholders.md`.

**Notif kinds nuevos**:

- `team_achievement_awarded` (al captain cuando admin grant un logro).
- `team_member_joined` (al captain cuando alguien se une via auto-accept).

Ambos seedeados en mig 164 + branches en `fn_dispatch_inapp_notifications`.

**Server actions**:

- `updateTeamSettings(teamId, patch)` — captain only, valida 4 booleans, audit normal.
- `grantTeamAchievement(...)` / `revokeTeamAchievement(...)` (en
  `src/server/actions/team-achievements.ts`) — admin only, `getAdminClient`
  + `setAuditActor("admin")`. Notif a captain on grant.
- `getTeamAchievementsServer(teamId, limit)` — helper server-side leído desde
  `TeamScreen.tsx` para mostrar el último en `TeamHome`.

**Path admin**: nuevo item `admin-user-teams` (Sidebar Plataforma) →
`AdminUserTeamsScreen`. Shell sin contenido a la espera de diseño; cuando
llegue, cablear las 3 actions de arriba.

---

### 29.25 · Cuenta de cobro del partner (mig 20260704120000)

Agrega `payout_account jsonb` a `partner_orgs`. Mismo shape que
`quedadas.payment_account`: `{bank, accountType, accountNumber, holderName, holderId?, note?}`.

```sql
alter table partner_orgs
  add column if not exists payout_account jsonb;
```

**Server actions** (`src/server/actions/partners.ts`):

- `savePartnerPayoutAccount(orgId, account)` — partner-admin o admin de plataforma;
  usa `getAdminClient + setAuditActor("partner")`. Acepta `null` para borrar.
- `getPartnerPayoutAccount(orgId)` — misma validación de acceso.

**UI** (`PartnerFinanzasScreenView`): tarjeta "Cuenta de cobro" con `BankAccountFields`
(reutilizado de quedadas). El hero de finanzas muestra banco + últimos 4 dígitos si hay cuenta.

**RLS**: no se agrega policy UPDATE en `partner_orgs`; la mutación siempre pasa
por `getAdminClient` tras validar membresía.

### 29.26 · Monitores de cancha e incidentes de partido (migs 20260626210000, 20260706000000)

**`tournament_court_monitors`** — asignación de monitor a una cancha durante un torneo.

```sql
create table public.tournament_court_monitors (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  court_id       uuid not null references courts(id) on delete cascade,
  user_id        uuid not null references profiles(id),
  assigned_by    uuid not null references profiles(id),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint uq_monitor_active_per_court unique nulls not distinct (court_id, tournament_id, is_active)
);
```

En el publication `supabase_realtime`. RLS: admin ve todo; partner ve los de su torneo; monitor ve los suyos.

**`match_incidents`** — incidentes reportados por el monitor durante un partido.

```sql
create table public.match_incidents (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null,
  match_type    text not null check (match_type in ('bracket','group')),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  court_id      uuid references courts(id),
  reported_by   uuid not null references profiles(id),
  type          text not null check (type in ('behavior','equipment','weather','other')),
  notes         text,
  created_at    timestamptz not null default now()
);
```

En el publication `supabase_realtime`. RLS: admin ve todo; partner ve los de su torneo (`mi_partner_select`); monitor ve solo los suyos. Audit trigger `tg_audit_match_incidents`.

**Notif**: `match_incident_reported` (mig 20260630100000) — se envía al partner org vía `notifyPartnerOrgStaff` desde `reportMatchIncident`.

**Feature flag**: `tournament_monitors_enabled` (mig 20260626210001, `enabled_default: false`). Activa la sección en el panel partner y la ruta `/t/[slug]/monitor`.

**`match_rating_applications`** (mig 20260710000000) — delta EFECTIVO de ELO aplicado a cada jugador por partido de torneo. Permite revertir con exactitud cuando el organizador corrige un ganador.

```sql
create table public.match_rating_applications (
  id          uuid primary key default gen_random_uuid(),
  match_type  text not null check (match_type in ('bracket', 'group')),
  match_id    uuid not null,
  user_id     uuid not null references profiles(id) on delete cascade,
  sport       mp_sport not null,
  mode        mp_match_mode not null,
  delta       int not null,          -- delta efectivo (incluye clamp a rating mínimo 100)
  won         boolean not null,
  applied_at  timestamptz not null default now(),
  unique (match_type, match_id, user_id)
);
```

RLS: solo `mp_is_admin()` puede select; nadie muta desde el cliente (escrituras solo vía las funciones SECURITY DEFINER de ELO). Audit trigger `tg_audit_match_rating_applications`. NO está en el publication realtime.

Funciones asociadas (mismas mig):
- `fn_recalculate_elo_for_bracket_match` / `fn_recalculate_elo_for_group_match` — reescritas para insertar el delta efectivo por jugador al aplicar.
- `fn_revert_elo_for_match(match_type, match_id) → boolean` — deshace deltas + contadores (`matches_total`, `wins`, `losses`), borra las filas y limpia `rating_applied_at`. Devuelve `false` para partidos aplicados antes de la mig (sin filas) → esos no se revierten ni re-aplican. `peak_rating` no se revierte (cota histórica).
- Triggers `tg_bracket_matches_elo_on_update` / `tg_group_matches_elo_on_update` — si cambia `winner_side` de un partido ya aplicado: revert + re-aplicar. Solo-score (mismo ganador) no toca ELO.
- Las 3 funciones tienen `revoke execute from anon, authenticated` (solo triggers las llaman).

**Shape de `score` en `bracket_matches`/`tournament_group_matches`**: `{sets: [{a,b}...], serving?: 'a'|'b', current?: {a,b}}` — `current` son los puntos del set en curso que el monitor persiste con debounce (2s); `submitMatchResult` lo limpia al escribir el score final. Standings solo leen `sets` de partidos `confirmed`.

**`tournament_id` denormalizado** (mig 20260715000000) en `bracket_matches`, `tournament_group_matches` y `tournament_groups`: NOT NULL + índice + trigger BEFORE INSERT que lo llena solo (los inserts del código NO lo setean). Existe para que las suscripciones realtime filtren por torneo en el CDC (antes: fanout global — ver `50-realtime.md` §16). No usarlo como fuente de verdad relacional: la cadena canónica sigue siendo `bracket_id→brackets` / `group_id→groups→categories`.

**Notif**: `tournament_match_ready` (mig 20260710010000, kind + flag `tournament_match_ready_notifs` default ON) — "te toca jugar" al completarse el partido de un jugador. Helpers en `src/lib/notifications/tournament.ts`.

**`tournaments.allow_waitlist`** (mig 20260713000000) — boolean default false, toggle en el wizard (Step 3, junto a Cupos). Habilita lista de espera: `registerToTournament` encola `status='waitlist'` cuando torneo/categoría están llenos (sin transacción de pago), y `promoteFromWaitlist` (src/lib/tournaments/waitlist.ts) promueve FIFO al liberarse cupo. Waitlist NO consume cupo — todos los counts de cupo usan `in ('pending','accepted')`. La columna también se agregó a la vista `tournaments_public_summary` (recreada en la misma mig) para los CTA de las cards.

**`refund_requests`** (mig 20260712000000) — cola de reembolsos pendientes de torneo. El registro FINAL del reembolso sigue siendo `refunds` + `transactions.status='refunded'`; esta tabla solo trackea el pendiente y su vencimiento.

```sql
create table public.refund_requests (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references transactions(id) on delete cascade,
  registration_id uuid references registrations(id) on delete set null,
  tournament_id   uuid not null references tournaments(id) on delete cascade,
  requested_by    uuid references profiles(id) on delete set null,
  reason          text not null,
  status          text not null default 'pending' check (status in ('pending','done','dismissed')),
  due_at          timestamptz,   -- created_at + platform_config.refund_window_days
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references profiles(id) on delete set null,
  unique (transaction_id)        -- dedup entre path individual y masivo
);
```

Se encola desde `cancelMyRegistration` (tx captured) y `setTournamentStatus→cancelled` (bulk). Se cierra (`done`) desde `markTransactionRefundedCore` al marcar la tx reembolsada. RLS: admin all + editor del torneo select (predicado partner/club de mig 20260709010000). Audit `tg_audit_refund_requests`. NO realtime. Notif: `refund_requested` al staff del organizador.

---

## Próximo: `30-rls.md`

Detalla la matriz **rol × tabla** con la SQL exacta de cada `create policy`, usando los helpers `auth.has_club_access(...)` y `auth.active_role()` definidos arriba.
