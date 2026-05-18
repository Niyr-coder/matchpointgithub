-- 086 · audit_log captura actor en acciones admin
--
-- Bug: tg_audit lee auth.uid() pero las server actions admin usan service-role
-- (getAdminClient), donde auth.uid() es null. Resultado: actor_id null y
-- actor_role 'system' en operaciones críticas (grant MatchPoint+, override
-- de torneo, etc). Imposible responder "¿quién hizo qué?".
--
-- Fix: el trigger ahora prefiere current_setting('app.audit_actor_id') si
-- está seteado. Las server actions admin llaman mp_set_audit_actor(callerId,
-- 'admin') antes de la mutación.
--
-- Nota PgBouncer: el set_config se hace con is_local=false. En el pool
-- transaction-mode de Supabase, la conexión puede reciclarse entre
-- requests, por eso reseteamos siempre al final del request. No es 100%
-- bulletproof pero es mejor que el estado actual (null siempre).

create or replace function public.mp_set_audit_actor(_user_id uuid, _role text default 'admin')
returns void
language sql
security definer
set search_path = public
as $$
  select set_config('app.audit_actor_id', coalesce(_user_id::text, ''), false);
  select set_config('app.audit_actor_role', coalesce(_role, 'system'), false);
$$;

revoke all on function public.mp_set_audit_actor(uuid, text) from public;
grant execute on function public.mp_set_audit_actor(uuid, text) to authenticated, service_role;

create or replace function public.mp_clear_audit_actor()
returns void
language sql
security definer
set search_path = public
as $$
  select set_config('app.audit_actor_id', '', false);
  select set_config('app.audit_actor_role', '', false);
$$;

revoke all on function public.mp_clear_audit_actor() from public;
grant execute on function public.mp_clear_audit_actor() to authenticated, service_role;

create or replace function public.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _actor uuid := coalesce(
    auth.uid(),
    nullif(current_setting('app.audit_actor_id', true), '')::uuid
  );
  _role text := coalesce(
    nullif(current_setting('app.audit_actor_role', true), ''),
    nullif(current_setting('app.active_role', true), ''),
    case when _actor is not null then 'user' else 'system' end
  );
  _club uuid := nullif(current_setting('app.active_club_id', true), '')::uuid;
  _row jsonb;
  _entity_id uuid;
  _diff jsonb;
begin
  _row := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  begin
    _entity_id := nullif(_row->>'id', '')::uuid;
  exception when others then
    _entity_id := null;
  end;

  _diff := case tg_op
    when 'INSERT' then to_jsonb(new)
    when 'DELETE' then to_jsonb(old)
    when 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
  end;

  insert into audit_log (actor_id, actor_role, club_id, entity, entity_id, action, diff)
  values (_actor, _role, _club, tg_table_name, _entity_id, tg_op, _diff);

  return coalesce(new, old);
end $$;
