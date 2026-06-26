-- 20260626210000 · Sistema de monitores de cancha para torneos.
--
-- Un monitor es un usuario registrado que el partner asigna a una cancha
-- específica de su torneo. El monitor:
--   1. Hace check-in de ambos equipos
--   2. Lleva el marcador set a set (actualiza bracket_matches.score)
--   3. Envía el resultado → status='reported'
--   4. El partner aprueba → status='confirmed'
--
-- Restricciones:
--   · 1 monitor activo por cancha (unique index parcial)
--   · Máx 2 canchas por monitor por torneo (app-level validation en server action)

-- ── Tabla principal ──────────────────────────────────────────────────────────

create table public.tournament_court_monitors (
  id            uuid        primary key default gen_random_uuid(),
  tournament_id uuid        not null references public.tournaments(id)  on delete cascade,
  court_id      uuid        not null references public.courts(id)       on delete cascade,
  user_id       uuid        not null references public.profiles(id)     on delete cascade,
  position_label text,                    -- e.g. "Recepción", "Canchas Norte"
  assigned_by   uuid        not null references public.profiles(id),    -- partner admin que asignó
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

-- 1 monitor activo por cancha en un torneo
create unique index uq_monitor_active_per_court
  on public.tournament_court_monitors (tournament_id, court_id)
  where is_active = true;

-- lookup rápido: ¿cuáles canchas tiene asignadas este user en este torneo?
create index idx_tcm_user_tournament
  on public.tournament_court_monitors (user_id, tournament_id)
  where is_active = true;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.tournament_court_monitors enable row level security;

-- Admin ve todo
create policy tcm_admin_all on public.tournament_court_monitors
  for all using (mp_is_admin());

-- Partner admin del torneo puede leer y mutar sus asignaciones
create policy tcm_partner_all on public.tournament_court_monitors
  for all using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.partner_id is not null
        and mp_is_partner_admin_of(t.partner_id)
    )
  );

-- El monitor puede leer su propia asignación (para que el server component
-- de /t/[slug]/monitor pueda validar la sesión via getServerClient)
create policy tcm_self_select on public.tournament_court_monitors
  for select using (user_id = auth.uid());

-- ── Audit trigger ────────────────────────────────────────────────────────────

create trigger tg_audit_tournament_court_monitors
  after insert or update or delete
  on public.tournament_court_monitors
  for each row execute function tg_audit();

-- ── Realtime publication ─────────────────────────────────────────────────────
-- Agrega tournament_court_monitors y tournament_group_matches a la publication.
-- tournament_group_matches aún no estaba (mig 177 la omitió).

do $$
declare _t text;
begin
  foreach _t in array array['tournament_court_monitors', 'tournament_group_matches'] loop
    if to_regclass(format('public.%I', _t)) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = _t
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', _t);
    end if;
  end loop;
end $$;
