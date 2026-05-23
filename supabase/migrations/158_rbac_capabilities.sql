-- 158 · RBAC granular: catálogo de capacidades + matriz rol×capacidad editable
-- + helper mp_role_can(). Stage 1: hace REAL la matriz de "Permisos & Roles"
-- (admin puede editarla, persiste, se audita). El enforcement se adopta luego.
-- admin = todo, INMUTABLE (mp_role_can hardcodea true para admin → no se puede
-- bloquear al admin desde la matriz). Ver docs/guides/00-roles.md.

-- Catálogo de capacidades (las 17 de la matriz del diseño).
create table if not exists capabilities (
  key text primary key,
  domain text not null,
  label text not null,
  sort int not null default 0
);

insert into capabilities (key, domain, label, sort) values
  ('clubs.view', 'Clubes', 'Ver clubes', 10),
  ('clubs.create', 'Clubes', 'Crear clubes', 11),
  ('clubs.verify', 'Clubes', 'Verificar (badge oficial)', 12),
  ('clubs.suspend', 'Clubes', 'Suspender clubes', 13),
  ('users.view', 'Usuarios', 'Ver perfiles', 20),
  ('users.suspend', 'Usuarios', 'Suspender cuentas', 21),
  ('users.impersonate', 'Usuarios', 'Impersonar usuarios', 22),
  ('pay.process', 'Pagos', 'Procesar pagos', 30),
  ('pay.refund', 'Pagos', 'Reembolsar', 31),
  ('pay.payout', 'Pagos', 'Aprobar payouts', 32),
  ('mod.resolve', 'Moderación', 'Resolver reportes', 40),
  ('mod.ban', 'Moderación', 'Banear usuarios', 41),
  ('mod.appeal', 'Moderación', 'Revisar apelaciones', 42),
  ('sys.audit', 'Sistema', 'Ver audit log', 50),
  ('sys.config', 'Sistema', 'Editar configuración', 51),
  ('sys.flags', 'Sistema', 'Modificar feature flags', 52),
  ('sys.roles', 'Sistema', 'Asignar roles', 53)
on conflict (key) do nothing;

-- Matriz rol × capacidad. Nivel: all/limited/own/public/none.
-- Ausencia de fila = 'none' (denegado). El editor hace upsert.
create table if not exists role_capabilities (
  role text not null,
  cap_key text not null references capabilities(key) on delete cascade,
  level text not null default 'none' check (level in ('all', 'limited', 'own', 'public', 'none')),
  updated_at timestamptz not null default now(),
  primary key (role, cap_key)
);

-- Seed: admin = all en todo (inmutable de todas formas).
insert into role_capabilities (role, cap_key, level)
  select 'admin', key, 'all' from capabilities
on conflict (role, cap_key) do nothing;

-- Seed del resto (solo niveles != none; el resto queda implícito en 'none').
insert into role_capabilities (role, cap_key, level) values
  ('partner', 'clubs.view', 'own'), ('partner', 'users.view', 'own'), ('partner', 'pay.process', 'own'), ('partner', 'pay.refund', 'own'), ('partner', 'pay.payout', 'own'), ('partner', 'sys.audit', 'own'),
  ('owner', 'clubs.view', 'own'), ('owner', 'users.view', 'own'), ('owner', 'pay.process', 'own'), ('owner', 'pay.refund', 'own'), ('owner', 'pay.payout', 'own'), ('owner', 'mod.resolve', 'own'), ('owner', 'mod.ban', 'own'), ('owner', 'sys.audit', 'own'), ('owner', 'sys.config', 'own'), ('owner', 'sys.roles', 'own'),
  ('manager', 'clubs.view', 'own'), ('manager', 'users.view', 'own'), ('manager', 'pay.process', 'own'), ('manager', 'pay.refund', 'limited'), ('manager', 'mod.resolve', 'own'), ('manager', 'sys.config', 'own'),
  ('coach', 'clubs.view', 'own'), ('coach', 'users.view', 'own'), ('coach', 'pay.process', 'own'),
  ('employee', 'clubs.view', 'own'), ('employee', 'users.view', 'own'), ('employee', 'pay.process', 'limited'), ('employee', 'pay.refund', 'limited'),
  ('user', 'clubs.view', 'public'), ('user', 'users.view', 'public'), ('user', 'pay.process', 'own'), ('user', 'mod.appeal', 'own'), ('user', 'sys.audit', 'own'), ('user', 'sys.config', 'own')
on conflict (role, cap_key) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table capabilities enable row level security;
alter table role_capabilities enable row level security;

-- Catálogo: lectura para cualquier autenticado; sin mutación desde la app.
drop policy if exists cap_authn_select on capabilities;
create policy cap_authn_select on capabilities for select using (auth.uid() is not null);

-- Matriz: lectura autenticado; mutación solo admin.
drop policy if exists rolecap_authn_select on role_capabilities;
create policy rolecap_authn_select on role_capabilities for select using (auth.uid() is not null);
drop policy if exists rolecap_admin_all on role_capabilities;
create policy rolecap_admin_all on role_capabilities for all using (mp_is_admin()) with check (mp_is_admin());

-- Audit del editor de permisos.
drop trigger if exists tg_audit_role_capabilities on role_capabilities;
create trigger tg_audit_role_capabilities after insert or update or delete on role_capabilities
  for each row execute function tg_audit();

-- ── Helper de enforcement ─────────────────────────────────────────────────
-- ¿El usuario _uid puede la capacidad _cap (opcionalmente en el club _club)?
-- admin → siempre true (inmutable). Para los demás, gana el nivel más permisivo
-- entre sus roles activos. 'own' requiere match de club cuando se pasa _club.
-- NOTA: 'limited' se trata como permitido (refinamiento por-capacidad pendiente
-- en stages posteriores). El enforcement profundo en RLS es Stage 3.
create or replace function mp_role_can(_uid uuid, _cap text, _club uuid default null)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r record; _lvl text;
begin
  if _uid is null then return false; end if;
  if exists (select 1 from role_assignments where user_id = _uid and role = 'admin' and revoked_at is null) then
    return true;
  end if;
  for r in select distinct role, club_id from role_assignments where user_id = _uid and revoked_at is null loop
    select level into _lvl from role_capabilities where role = r.role and cap_key = _cap;
    if _lvl is null then _lvl := 'none'; end if;
    if _lvl in ('all', 'public', 'limited') then
      return true;
    elsif _lvl = 'own' then
      if _club is null or r.club_id = _club then return true; end if;
    end if;
  end loop;
  return false;
end $$;

grant execute on function mp_role_can(uuid, text, uuid) to authenticated;
