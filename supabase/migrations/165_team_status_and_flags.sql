-- 165 · Status + verified + pinned en teams.
-- Habilita los flujos de moderación admin (suspender/archivar/disolver) +
-- badge verified + pin en discovery. Antes era todo "Pronto".
--
-- status: 'active' (default), 'suspended' (oculto + read-only para members),
--   'archived' (oculto + sin partidos). dissolveTeam sigue siendo hard-delete.
-- is_verified: badge azul ("verified") en TeamHome + tabla admin.
-- is_pinned: ordena primero en discovery (loadPublicTeams).
--
-- AuthN: los 3 campos los escribe SOLO admin via service-role (con audit).
-- Captain via updateTeam() ignora estos campos. Defensa contra escrituras
-- directas: trigger BEFORE UPDATE que revierte cambios si el caller no es
-- service-role (auth.uid() != NULL).

alter table teams
  add column if not exists status text not null default 'active'
    check (status in ('active','suspended','archived')),
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_pinned boolean not null default false;

create index if not exists idx_teams_status on teams (status);
create index if not exists idx_teams_pinned on teams (is_pinned) where is_pinned;

create or replace function fn_teams_protect_admin_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- service-role no tiene auth.uid() en el contexto de la transacción cuando
  -- llamamos vía getAdminClient con bypass. Cualquier caller con auth.uid()
  -- (captain via REST, app code) NO puede cambiar estos 3 campos.
  if auth.uid() is not null then
    if new.status is distinct from old.status then
      new.status := old.status;
    end if;
    if new.is_verified is distinct from old.is_verified then
      new.is_verified := old.is_verified;
    end if;
    if new.is_pinned is distinct from old.is_pinned then
      new.is_pinned := old.is_pinned;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_teams_protect_admin_fields on teams;
create trigger tg_teams_protect_admin_fields
  before update on teams
  for each row execute function fn_teams_protect_admin_fields();
