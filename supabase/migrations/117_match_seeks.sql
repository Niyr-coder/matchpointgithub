-- 117 · Tablón "Busco partido" (match seeks / LFG).
-- Ver docs/product/03-match-seeks.md y docs/architecture/20-database.md §29.
--
-- Verificación previa al schema (no duplicar):
--  · `mp_match_mode` ('singles','doubles') YA existe en 053_matches.sql → se reutiliza.
--  · `mp_sport` YA existe (002_enums.sql) → se reutiliza.
--  · `mp_match_seek_status` es nuevo: ciclo de vida del aviso de búsqueda.
--
-- Modelo:
--  · match_seeks            → el aviso que publica un jugador buscando rival.
--  · match_seek_applications→ las postulaciones de otros jugadores al aviso.
--
-- Dobles: el autor publica con su partner (partner_id obligatorio) → su lado es
-- [autor, partner]. Los postulantes aplican como dupla (partner_id) → el lado
-- rival es [postulante, su partner]. Así el match resultante siempre es 2v2
-- válido para createMatch y el ELO.

create type mp_match_seek_status as enum ('open', 'matched', 'expired', 'cancelled');

-- ── match_seeks ───────────────────────────────────────────────────────────
create table match_seeks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id) on delete cascade,
  sport mp_sport not null,
  mode mp_match_mode not null,
  -- partner del autor (obligatorio en doubles, null en singles).
  partner_id uuid references profiles(id) on delete set null,
  -- Snapshot de la ciudad del autor al publicar — eje de filtrado del feed.
  city text,
  -- Club preferido (opcional). "Cualquier club de mi ciudad" = null.
  club_id uuid references clubs(id) on delete set null,
  -- Rango de nivel buscado en escala display (ej. 3.8 – 4.6). Null = sin tope.
  skill_min numeric(3,1),
  skill_max numeric(3,1),
  ranked boolean not null default true,
  -- Ventana en que el autor puede jugar.
  window_start timestamptz not null,
  window_end timestamptz,
  notes text,
  status mp_match_seek_status not null default 'open',
  -- El match que se crea cuando el autor acepta a un postulante.
  match_id uuid references matches(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Doubles requiere partner del autor; singles no lo lleva.
  constraint match_seeks_partner_by_mode check (
    (mode = 'singles' and partner_id is null)
    or (mode = 'doubles' and partner_id is not null)
  ),
  -- El partner del autor no puede ser el autor mismo.
  constraint match_seeks_partner_distinct check (
    partner_id is null or partner_id <> created_by
  ),
  -- Rango de nivel coherente.
  constraint match_seeks_skill_range check (
    skill_min is null or skill_max is null or skill_min <= skill_max
  ),
  -- Ventana coherente.
  constraint match_seeks_window check (
    window_end is null or window_end >= window_start
  )
);

create index idx_match_seeks_feed
  on match_seeks (city, sport, status, window_start);
create index idx_match_seeks_creator
  on match_seeks (created_by, created_at desc);
create index idx_match_seeks_open_expiry
  on match_seeks (expires_at) where status = 'open';

create trigger tg_match_seeks_updated_at
  before update on match_seeks
  for each row execute function tg_set_updated_at();

comment on table match_seeks is
  'Avisos "Busco partido": un jugador publica que busca rival; otros se postulan. Al aceptar se crea un match (status=scheduled). Ver docs/product/03-match-seeks.md.';

-- ── match_seek_applications ───────────────────────────────────────────────
create table match_seek_applications (
  id uuid primary key default gen_random_uuid(),
  seek_id uuid not null references match_seeks(id) on delete cascade,
  applicant_id uuid not null references profiles(id) on delete cascade,
  -- partner del postulante (obligatorio si el seek es doubles).
  partner_id uuid references profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,

  -- Un jugador no se postula dos veces al mismo aviso.
  unique (seek_id, applicant_id),
  -- El postulante no puede ser su propio partner.
  constraint msa_partner_distinct check (
    partner_id is null or partner_id <> applicant_id
  )
);

create index idx_msa_seek_status on match_seek_applications (seek_id, status);
create index idx_msa_applicant on match_seek_applications (applicant_id, created_at desc);

comment on table match_seek_applications is
  'Postulaciones a un match_seek. El autor del seek acepta una → se crea el match.';

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Patrón espejo de team_join_requests (mig 037): dueño del recurso muta,
-- lectura pública filtrada para avisos abiertos.
alter table match_seeks enable row level security;

-- SELECT: el autor ve los suyos; cualquiera ve los avisos abiertos (el feed
-- filtra por ciudad en la query, no en la policy). Admin ve todo.
drop policy if exists ms_select on match_seeks;
create policy ms_select on match_seeks for select using (
  created_by = auth.uid()
  or status = 'open'
  or mp_is_admin()
);

-- INSERT: el autor publica su propio aviso.
drop policy if exists ms_insert on match_seeks;
create policy ms_insert on match_seeks for insert with check (
  created_by = auth.uid()
);

-- UPDATE / DELETE: solo el autor (cancelar / editar) o admin.
drop policy if exists ms_update on match_seeks;
create policy ms_update on match_seeks for update using (
  created_by = auth.uid() or mp_is_admin()
) with check (
  created_by = auth.uid() or mp_is_admin()
);

drop policy if exists ms_delete on match_seeks;
create policy ms_delete on match_seeks for delete using (
  created_by = auth.uid() or mp_is_admin()
);

alter table match_seek_applications enable row level security;

-- SELECT: el postulante (y su partner) ven la suya; el autor del seek ve las
-- de su aviso. Admin ve todo.
drop policy if exists msa_select on match_seek_applications;
create policy msa_select on match_seek_applications for select using (
  applicant_id = auth.uid()
  or partner_id = auth.uid()
  or exists (select 1 from match_seeks s where s.id = seek_id and s.created_by = auth.uid())
  or mp_is_admin()
);

-- INSERT: el postulante se postula a sí mismo, solo a avisos abiertos, y no a
-- su propio aviso.
drop policy if exists msa_insert on match_seek_applications;
create policy msa_insert on match_seek_applications for insert with check (
  applicant_id = auth.uid()
  and exists (
    select 1 from match_seeks s
    where s.id = seek_id and s.status = 'open' and s.created_by <> auth.uid()
  )
);

-- UPDATE: el postulante puede retirar la suya; el autor del seek responde
-- (aceptar/rechazar). Admin todo.
drop policy if exists msa_update_self on match_seek_applications;
create policy msa_update_self on match_seek_applications for update using (
  applicant_id = auth.uid()
);

drop policy if exists msa_update_owner on match_seek_applications;
create policy msa_update_owner on match_seek_applications for update using (
  exists (select 1 from match_seeks s where s.id = seek_id and s.created_by = auth.uid())
  or mp_is_admin()
);

-- ── Audit (tg_audit, ver 099_audit_triggers.sql) ──────────────────────────
drop trigger if exists tg_audit_match_seeks on match_seeks;
create trigger tg_audit_match_seeks
  after insert or update or delete on match_seeks
  for each row execute function tg_audit();

drop trigger if exists tg_audit_match_seek_applications on match_seek_applications;
create trigger tg_audit_match_seek_applications
  after insert or update or delete on match_seek_applications
  for each row execute function tg_audit();

-- ── Realtime (publication supabase_realtime, ver 50-realtime.md §15) ───────
alter publication supabase_realtime add table match_seeks;
alter publication supabase_realtime add table match_seek_applications;
