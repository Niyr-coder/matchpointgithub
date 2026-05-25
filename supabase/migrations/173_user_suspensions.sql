-- 173 · Suspensión / ban de usuarios (gap A1 de MAT-70).
--
-- Tabla separada (no columna en profiles) por dos razones:
--   1) `profiles_self` RLS deja al dueño escribir su fila — meter
--      suspended_at en profiles obliga a trigger anti-tampering. Tabla
--      separada con RLS admin-only es más simple y auditable.
--   2) Historial: un mismo usuario puede ser suspendido y reactivado N veces;
--      la tabla guarda cada ciclo como fila.
--
-- Efectos cuando un usuario está suspendido (suspensión activa = última fila
-- sin reactivated_at):
--   - No puede iniciar sesión (chequeo en src/server/actions/auth.ts signIn).
--   - Sesión activa se invalida en el siguiente request (chequeo en proxy.ts).
--   - No puede inscribirse a torneos ni reservar (assertNotSuspended en
--     server actions críticas).
--   - Su perfil público se sigue mostrando, con badge "Cuenta suspendida".
--
-- Helper en código: src/lib/auth/suspension.ts.
-- UI admin: AdminUsersScreen → kebab del row.

create table user_suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  reason text not null check (length(reason) between 1 and 1000),
  suspended_by uuid references profiles(id) on delete set null,
  suspended_at timestamptz not null default now(),
  reactivated_at timestamptz,
  reactivated_by uuid references profiles(id) on delete set null,
  reactivation_reason text check (reactivation_reason is null or length(reactivation_reason) between 1 and 1000),
  -- A un usuario solo le permitimos UNA suspensión activa a la vez.
  -- Si quieren extender el motivo, primero reactivan y vuelven a suspender (queda en historial).
  constraint user_suspensions_reactivation_consistency check (
    (reactivated_at is null and reactivated_by is null and reactivation_reason is null)
    or (reactivated_at is not null)
  )
);

-- Lookup principal: ¿este usuario tiene una suspensión activa?
-- Unique parcial garantiza que no haya dos activas para el mismo usuario.
create unique index user_suspensions_active_unique
  on user_suspensions (user_id)
  where reactivated_at is null;

create index user_suspensions_by_user
  on user_suspensions (user_id, suspended_at desc);

alter table user_suspensions enable row level security;

-- Solo admin escribe. Cualquier usuario autenticado puede leer (para mostrar
-- badge en perfiles ajenos y para que los helpers de chequeo funcionen sin
-- privilegios elevados).
create policy user_suspensions_authn_select on user_suspensions for select
  using (auth.uid() is not null);

create policy user_suspensions_admin_all on user_suspensions for all
  using (mp_is_admin())
  with check (mp_is_admin());

-- Función helper (SQL puro, stable) para chequeos en JOINs / triggers.
create or replace function mp_user_is_suspended(p_user_id uuid) returns boolean
language sql stable as $$
  select exists(
    select 1 from user_suspensions
    where user_id = p_user_id and reactivated_at is null
  );
$$;

grant execute on function mp_user_is_suspended(uuid) to authenticated;
