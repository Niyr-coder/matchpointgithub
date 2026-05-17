-- 042 · fn_admin_audit_log
-- Permite a las server actions admin escribir entradas explícitas a audit_log
-- con un `action` semántico (ej: 'event_registration.admin_remove') más allá
-- de los INSERT/UPDATE/DELETE que produce el trigger tg_audit.
--
-- La función es SECURITY DEFINER porque audit_log tiene insert revocado a
-- authenticated/anon (ver 007_audit_log.sql). Internamente exige que el caller
-- tenga rol admin activo via role_assignments.
--
-- NO se aplica desde el agente B. Pendiente: revisar y aplicar manualmente.

create or replace function public.fn_admin_audit_log(
  p_entity text,
  p_entity_id uuid,
  p_action text,
  p_diff jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _actor uuid := auth.uid();
  _is_admin boolean;
begin
  if _actor is null then
    raise exception 'AUTH.UNAUTHENTICATED' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.role_assignments
    where user_id = _actor
      and role = 'admin'
      and revoked_at is null
  ) into _is_admin;

  if not _is_admin then
    raise exception 'AUTH.ROLE_REQUIRED' using errcode = '42501';
  end if;

  insert into public.audit_log (actor_id, actor_role, club_id, entity, entity_id, action, diff)
  values (_actor, 'admin', null, p_entity, p_entity_id, p_action, coalesce(p_diff, '{}'::jsonb));
end;
$$;

revoke all on function public.fn_admin_audit_log(text, uuid, text, jsonb) from public;
grant execute on function public.fn_admin_audit_log(text, uuid, text, jsonb) to authenticated;
