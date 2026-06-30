-- Incidentes reportados por monitores durante partidos.
-- El monitor inserta vía admin client (service-role); partner/admin leen vía RLS o admin client.

create table if not exists public.match_incidents (
  id            uuid        primary key default gen_random_uuid(),
  match_id      uuid        not null,
  match_type    text        not null check (match_type in ('bracket', 'group')),
  tournament_id uuid        not null references public.tournaments(id) on delete cascade,
  court_id      uuid        references public.courts(id),
  reported_by   uuid        not null references public.profiles(id),
  type          text        not null check (type in ('behavior', 'equipment', 'weather', 'other')),
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_match_incidents_tournament on public.match_incidents (tournament_id, created_at desc);
create index if not exists idx_match_incidents_match     on public.match_incidents (match_id, match_type);

-- ── Audit ────────────────────────────────────────────────────────────────────

create trigger tg_audit_match_incidents
  after insert or update or delete on public.match_incidents
  for each row execute function tg_audit();

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.match_incidents enable row level security;

-- Admin global ve y muta todo
create policy mi_admin_all on public.match_incidents
  for all using (mp_is_admin());

-- Partner ve los del torneo que administra
create policy mi_partner_select on public.match_incidents
  for select using (
    exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.partner_id is not null
        and mp_is_partner_admin_of(t.partner_id)
    )
  );

-- El monitor que reportó puede ver su propio incidente
create policy mi_reporter_select on public.match_incidents
  for select using (reported_by = auth.uid());

-- INSERT se hace exclusivamente desde service-role (getAdminClient) → no se necesita policy de insert para usuarios normales.

-- ── Realtime ─────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_incidents'
  ) then
    alter publication supabase_realtime add table public.match_incidents;
  end if;
end $$;
