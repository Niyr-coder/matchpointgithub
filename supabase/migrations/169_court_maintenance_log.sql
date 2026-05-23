-- 169 · Historial de mantenimientos de canchas.
-- Hoy `courts.maintenance_reason` + `maintenance_until` solo guardan el
-- estado actual. Esta tabla persiste cada ventana de mantenimiento que
-- pasó la cancha (cuándo arrancó, motivo, cuándo se cerró, quién lo hizo).

create table if not exists court_maintenance_log (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts(id) on delete cascade,
  reason text,
  starts_at timestamptz not null default now(),
  expected_until timestamptz,
  ended_at timestamptz,
  started_by uuid references profiles(id),
  ended_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_court_maint_log_court
  on court_maintenance_log (court_id, starts_at desc);
create index if not exists idx_court_maint_log_active
  on court_maintenance_log (court_id) where ended_at is null;

alter table court_maintenance_log enable row level security;

-- SELECT: staff del club. Reuso el mismo helper que ya gobierna courts.
drop policy if exists cml_staff_select on court_maintenance_log;
create policy cml_staff_select on court_maintenance_log
  for select using (
    mp_is_admin() or exists (
      select 1 from courts c
      join role_assignments r on r.club_id = c.club_id
      where c.id = court_maintenance_log.court_id
        and r.user_id = auth.uid()
        and r.role in ('owner','manager')
        and r.revoked_at is null
    )
  );

-- INSERT/UPDATE: solo admin via service-role (la action setCourtMaintenance
-- corre con admin client). No policy abierta.

drop trigger if exists tg_audit_court_maintenance_log on court_maintenance_log;
create trigger tg_audit_court_maintenance_log
  after insert or update or delete on court_maintenance_log
  for each row execute function tg_audit();
