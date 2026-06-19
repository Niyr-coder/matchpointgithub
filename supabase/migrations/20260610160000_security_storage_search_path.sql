-- P3 · Storage: buckets públicos sin listado vía API (URLs directas siguen funcionando).

drop policy if exists "clubs_public_select" on storage.objects;
drop policy if exists "avatars_public_select" on storage.objects;

-- search_path fijo en funciones flagged (solo si existen en el proyecto).
do $$
declare
  _spec text;
begin
  foreach _spec in array array[
    'public.tg_set_updated_at()',
    'public.tg_bump_version()',
    'public.fn_purge_expired_idempotency()',
    'public.gen_team_invite_code()',
    'public.gen_quedada_invite_code()',
    'public.fn_audit_content(audit_log)',
    'public.get_club_review_stats(uuid[])',
    'public.mp_user_is_suspended(uuid)',
    'public.mp_club_effective_plan(uuid)',
    'public.tg_help_articles_search_vector()',
    'public.tg_messages_bump_conv()'
  ]
  loop
    if to_regprocedure(_spec) is not null then
      execute format('alter function %s set search_path = public', _spec);
    end if;
  end loop;
end $$;
