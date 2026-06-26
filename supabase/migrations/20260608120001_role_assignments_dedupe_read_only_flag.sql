-- Dedupe role_assignments activos (NULL club/partner permitía filas duplicadas)
-- + índice único parcial + seed read_only_mode (apagado por defecto).

-- 1) Eliminar duplicados activos conservando la asignación más antigua.
with ranked as (
  select
    id,
    row_number() over (
      partition by
        user_id,
        role,
        coalesce(club_id, '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by granted_at asc nulls last, id asc
    ) as rn
  from public.role_assignments
  where revoked_at is null
)
delete from public.role_assignments ra
using ranked r
where ra.id = r.id
  and r.rn > 1;

-- 2) Un solo rol activo por ámbito (user + role + club + partner).
create unique index if not exists role_assignments_active_scope_unique
  on public.role_assignments (
    user_id,
    role,
    coalesce(club_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where revoked_at is null;

-- 3) Kill switch global de mutaciones (código en requireWritable).
insert into public.feature_flags (key, description, enabled_default, rollout_pct, env, impact)
values (
  'read_only_mode',
  'Modo solo lectura: bloquea mutaciones de jugadores y staff. Los admins pueden seguir operando.',
  false,
  0,
  'prod',
  'high'
)
on conflict (key) do nothing;
