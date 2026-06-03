-- Re-backfill de hash chain en audit_log.
-- Mig 154 pudo escribir hashes incorrectos (digest sin schema extensions);
-- mig 155 arregló el trigger pero no recomputó filas existentes. Además, si
-- hubo DELETE en audit_log (no debería), los prev_hash quedan desalineados.

create or replace function fn_rebackfill_audit_chain()
returns table(rebuilt bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r audit_log%rowtype;
  _prev text;
  _h text;
  _n bigint := 0;
begin
  if not mp_is_admin() then
    raise exception 'AUDIT.ADMIN_REQUIRED';
  end if;

  _prev := null;
  for r in select * from audit_log order by id asc loop
    _h := encode(digest(coalesce(_prev, '') || '::' || fn_audit_content(r), 'sha256'), 'hex');
    update audit_log set prev_hash = _prev, row_hash = _h where id = r.id;
    _prev := _h;
    _n := _n + 1;
  end loop;

  perform fn_admin_audit_log(
    'audit_log',
    null,
    'audit_chain.rebackfill',
    jsonb_build_object('rebuilt', _n)
  );

  return query select _n;
end $$;

grant execute on function fn_rebackfill_audit_chain() to authenticated;

-- Aplicar en deploy (service role / migración).
do $$
declare
  r audit_log%rowtype;
  _prev text;
  _h text;
begin
  _prev := null;
  for r in select * from audit_log order by id asc loop
    _h := encode(digest(coalesce(_prev, '') || '::' || fn_audit_content(r), 'sha256'), 'hex');
    update audit_log set prev_hash = _prev, row_hash = _h where id = r.id;
    _prev := _h;
  end loop;
end $$;
