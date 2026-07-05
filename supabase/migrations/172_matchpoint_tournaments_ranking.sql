-- 172 · MatchPoint tournaments + ranking (MAT-82).
--
-- Nuevo pipeline de torneos MatchPoint (parada del piloto sept-2026, MAT-77):
-- registro por evento con autoclasificación por nivel + modalidad/categoría,
-- configuración de puntos por posición, resultados por evento, y bracket
-- generator (round-robin + eliminación).
--
-- Convenciones y decisiones (documentadas para siblings MAT-83/84/85):
-- ─ Se EXTIENDE `event_registrations` en vez de crear una tabla paralela: la
--   tabla ya existe con (event_id, user_id, status), solo faltaba el detalle
--   de nivel/modalidad/categoría/comprobante. `payment_status` es un tracking
--   separado del `status` de inscripción (registered/pending_payment/…): la
--   inscripción vive en el flujo actual, y el pago se marca aparte para
--   permitir estados intermedios (`confirmed` = admin aprobó comprobante).
-- ─ Los brackets del piloto usan tablas propias (`tournament_brackets` y
--   `tournament_bracket_matches`) en vez de reutilizar `brackets`/
--   `bracket_matches` (que están amarradas a `tournaments` + FK a
--   `match_results`). El pipeline nuevo referencia `events` directamente y no
--   toca `match_results`.
-- ─ RLS mínimo: usuario ve sus propias inscripciones (ya existe `er_self`);
--   se añade lectura pública para configuración de puntos, resultados y
--   brackets (necesarios para /rankings y la página pública del bracket
--   descrita en MAT-77 §7); admin controla escritura.
-- ─ Nivel y modalidad se guardan como `text` con CHECK — la especificación
--   del ticket usa strings ("2.5","3.0",…, "mens_doubles"). Los enums
--   existentes (`mp_skill_level`, `mp_tournament_modality`) tienen otros
--   valores y quedan reservados para el pipeline generalista.

-- ── 1. event_registrations · nuevas columnas ────────────────────────────
alter table public.event_registrations
  add column if not exists partner_user_id  uuid references public.profiles(id),
  add column if not exists level             text,
  add column if not exists level_verified    boolean not null default false,
  add column if not exists modality          text,
  add column if not exists category          text,
  add column if not exists payment_status    text,
  add column if not exists payment_proof_url text,
  add column if not exists updated_at        timestamptz not null default now();

alter table public.event_registrations
  drop constraint if exists er_level_chk;
alter table public.event_registrations
  add constraint er_level_chk
  check (level is null or level in ('2.5','3.0','3.5','4.0+'));

alter table public.event_registrations
  drop constraint if exists er_modality_chk;
alter table public.event_registrations
  add constraint er_modality_chk
  check (modality is null or modality in ('mens_doubles','womens_doubles','mixed_doubles'));

alter table public.event_registrations
  drop constraint if exists er_category_chk;
alter table public.event_registrations
  add constraint er_category_chk
  check (category is null or category in ('open','senior_50'));

alter table public.event_registrations
  drop constraint if exists er_payment_status_chk;
alter table public.event_registrations
  add constraint er_payment_status_chk
  check (payment_status is null or payment_status in ('pending','confirmed','rejected'));

drop trigger if exists tg_event_registrations_updated on public.event_registrations;
create trigger tg_event_registrations_updated before update on public.event_registrations
  for each row execute function tg_set_updated_at();

create index if not exists idx_event_registrations_user
  on public.event_registrations (user_id);
create index if not exists idx_event_registrations_event
  on public.event_registrations (event_id);
create index if not exists idx_event_registrations_partner
  on public.event_registrations (partner_user_id)
  where partner_user_id is not null;

comment on column public.event_registrations.partner_user_id is
  'Pareja en modalidades de dobles (NULL si aún no confirmada / singles).';
comment on column public.event_registrations.level is
  'Nivel MatchPoint autoclasificado (2.5/3.0/3.5/4.0+). Editable si level_verified=false.';
comment on column public.event_registrations.level_verified is
  'True cuando un admin/coach validó el nivel; bloquea auto-edición.';
comment on column public.event_registrations.payment_status is
  'Estado del comprobante de pago (pending/confirmed/rejected). Independiente del `status` de inscripción.';

-- ── 2. event_point_config · puntos por posición ─────────────────────────
create table if not exists public.event_point_config (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references public.events(id) on delete cascade,
  category   text not null check (category in ('open','senior_50')),
  modality   text not null check (modality in ('mens_doubles','womens_doubles','mixed_doubles')),
  position   int  not null check (position >= 1),
  points     int  not null check (points >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, category, modality, position)
);

create index if not exists idx_event_point_config_event
  on public.event_point_config (event_id);
create index if not exists idx_event_point_config_global
  on public.event_point_config (category, modality, position)
  where event_id is null;

drop trigger if exists tg_event_point_config_updated on public.event_point_config;
create trigger tg_event_point_config_updated before update on public.event_point_config
  for each row execute function tg_set_updated_at();

comment on table public.event_point_config is
  'Configuración de puntos por posición para el ranking anual MatchPoint. event_id NULL = tabla global reutilizable.';

-- ── 3. event_results · resultado final por jugador ──────────────────────
create table if not exists public.event_results (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  registration_id uuid not null references public.event_registrations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  position        int  not null check (position >= 1),
  points_awarded  int  not null check (points_awarded >= 0),
  year            int  not null,
  created_at      timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists idx_event_results_event on public.event_results (event_id);
create index if not exists idx_event_results_user  on public.event_results (user_id);
create index if not exists idx_event_results_year  on public.event_results (year);
create index if not exists idx_event_results_ranking
  on public.event_results (year, user_id, points_awarded desc);

comment on table public.event_results is
  'Resultado final por jugador/pareja en un evento. Alimenta el ranking anual MatchPoint.';
comment on column public.event_results.year is
  'Año calendario del evento (para bucketing del ranking anual).';

-- ── 4. tournament_brackets · estructura del bracket por evento ──────────
create table if not exists public.tournament_brackets (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  status       text not null default 'draft' check (status in ('draft','active','completed')),
  generated_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_tournament_brackets_event
  on public.tournament_brackets (event_id);

drop trigger if exists tg_tournament_brackets_updated on public.tournament_brackets;
create trigger tg_tournament_brackets_updated before update on public.tournament_brackets
  for each row execute function tg_set_updated_at();

comment on table public.tournament_brackets is
  'Bracket generado para un evento MatchPoint. Nombre distinto de `brackets` (pipeline generalista de tournaments).';

-- ── 5. tournament_bracket_matches · partidos del bracket ────────────────
-- (Renombrado desde el `bracket_matches` del ticket para evitar colisión con
-- la tabla `bracket_matches` del pipeline general de tournaments/brackets.)
create table if not exists public.tournament_bracket_matches (
  id                       uuid primary key default gen_random_uuid(),
  bracket_id               uuid not null references public.tournament_brackets(id) on delete cascade,
  round                    int not null check (round >= 1),
  match_number             int not null check (match_number >= 1),
  team1_registration_id    uuid references public.event_registrations(id),
  team2_registration_id    uuid references public.event_registrations(id),
  winner_registration_id   uuid references public.event_registrations(id),
  score_team1              text,
  score_team2              text,
  scheduled_time           timestamptz,
  court                    text,
  completed                boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (bracket_id, round, match_number)
);

create index if not exists idx_tournament_bracket_matches_bracket
  on public.tournament_bracket_matches (bracket_id, round, match_number);
create index if not exists idx_tournament_bracket_matches_scheduled
  on public.tournament_bracket_matches (scheduled_time)
  where scheduled_time is not null;

drop trigger if exists tg_tournament_bracket_matches_updated on public.tournament_bracket_matches;
create trigger tg_tournament_bracket_matches_updated before update on public.tournament_bracket_matches
  for each row execute function tg_set_updated_at();

-- ── 6. RLS ──────────────────────────────────────────────────────────────
-- event_registrations: RLS ya habilitado en 021; añadimos vista pública
-- limitada para que el bracket público (MAT-77 §7) muestre nombres de jugador.
-- La política existente `er_self` cubre lectura del propio usuario, y
-- `er_organizer_select` cubre lectura del organizador.
drop policy if exists er_admin_all on public.event_registrations;
create policy er_admin_all on public.event_registrations for all using (mp_is_admin());

-- event_point_config: lectura pública, escritura admin.
alter table public.event_point_config enable row level security;
drop policy if exists epc_public_select on public.event_point_config;
create policy epc_public_select on public.event_point_config for select using (true);
drop policy if exists epc_admin_all on public.event_point_config;
create policy epc_admin_all on public.event_point_config for all using (mp_is_admin());

-- event_results: lectura pública (feed del ranking anual), escritura admin.
alter table public.event_results enable row level security;
drop policy if exists er_res_public_select on public.event_results;
create policy er_res_public_select on public.event_results for select using (true);
drop policy if exists er_res_admin_all on public.event_results;
create policy er_res_admin_all on public.event_results for all using (mp_is_admin());

-- tournament_brackets: lectura pública (página pública del bracket),
-- escritura admin/organizador del evento.
alter table public.tournament_brackets enable row level security;
drop policy if exists tb_public_select on public.tournament_brackets;
create policy tb_public_select on public.tournament_brackets for select using (true);
drop policy if exists tb_admin_all on public.tournament_brackets;
create policy tb_admin_all on public.tournament_brackets for all using (mp_is_admin());
drop policy if exists tb_organizer_all on public.tournament_brackets;
create policy tb_organizer_all on public.tournament_brackets for all using (
  exists (
    select 1 from public.events e
    where e.id = tournament_brackets.event_id
      and (e.organizer_id = auth.uid()
           or (e.club_id is not null and public.mp_club_staff(e.club_id)))
  )
);

-- tournament_bracket_matches: lectura pública, escritura admin/organizador.
alter table public.tournament_bracket_matches enable row level security;
drop policy if exists tbm_public_select on public.tournament_bracket_matches;
create policy tbm_public_select on public.tournament_bracket_matches for select using (true);
drop policy if exists tbm_admin_all on public.tournament_bracket_matches;
create policy tbm_admin_all on public.tournament_bracket_matches for all using (mp_is_admin());
drop policy if exists tbm_organizer_all on public.tournament_bracket_matches;
create policy tbm_organizer_all on public.tournament_bracket_matches for all using (
  exists (
    select 1 from public.tournament_brackets tb
    join public.events e on e.id = tb.event_id
    where tb.id = tournament_bracket_matches.bracket_id
      and (e.organizer_id = auth.uid()
           or (e.club_id is not null and public.mp_club_staff(e.club_id)))
  )
);

-- ── 7. Audit triggers ───────────────────────────────────────────────────
-- Añadimos las nuevas tablas al conjunto auditable (mismo patrón que 099).
drop trigger if exists tg_audit_event_point_config on public.event_point_config;
create trigger tg_audit_event_point_config
  after insert or update or delete on public.event_point_config
  for each row execute function tg_audit();

drop trigger if exists tg_audit_event_results on public.event_results;
create trigger tg_audit_event_results
  after insert or update or delete on public.event_results
  for each row execute function tg_audit();

drop trigger if exists tg_audit_tournament_brackets on public.tournament_brackets;
create trigger tg_audit_tournament_brackets
  after insert or update or delete on public.tournament_brackets
  for each row execute function tg_audit();

drop trigger if exists tg_audit_tournament_bracket_matches on public.tournament_bracket_matches;
create trigger tg_audit_tournament_bracket_matches
  after insert or update or delete on public.tournament_bracket_matches
  for each row execute function tg_audit();
