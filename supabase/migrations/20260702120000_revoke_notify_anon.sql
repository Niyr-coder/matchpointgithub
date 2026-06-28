-- fn_enqueue_notification se creó con SECURITY DEFINER pero sin REVOKE FROM PUBLIC
-- explícito → callers 'anon' (no autenticados) podían invocarla vía postgrest.
-- Solo 'authenticated' y 'service_role' deben poder llamarla.

revoke execute
  on function public.fn_enqueue_notification(uuid, public.mp_role, text, text, text, jsonb)
  from public;

grant execute
  on function public.fn_enqueue_notification(uuid, public.mp_role, text, text, text, jsonb)
  to authenticated;

grant execute
  on function public.fn_enqueue_notification(uuid, public.mp_role, text, text, text, jsonb)
  to service_role;
