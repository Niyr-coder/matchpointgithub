-- 155 · Fix hash chain: pgcrypto (digest) vive en el schema `extensions` en
-- Supabase, pero tg_audit_chain y fn_verify_audit_chain tenían search_path=public
-- → "function digest(text, unknown) does not exist". Incluir `extensions`.
-- (El backfill de 154 funcionó porque el DO block usaba el search_path default.)

create or replace function tg_audit_chain() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare _prev text;
begin
  perform pg_advisory_xact_lock(hashtext('audit_log_chain')::bigint);
  select row_hash into _prev from audit_log order by id desc limit 1;
  new.prev_hash := _prev;
  new.row_hash := encode(digest(coalesce(_prev, '') || '::' || fn_audit_content(new), 'sha256'), 'hex');
  return new;
end $$;

create or replace function fn_verify_audit_chain()
returns table(ok boolean, checked bigint, broken_id bigint)
language plpgsql security definer set search_path = public, extensions as $$
declare r audit_log%rowtype; _prev text; _exp text; _broken bigint := null; _n bigint := 0;
begin
  if not mp_is_admin() then raise exception 'AUDIT.ADMIN_REQUIRED'; end if;
  _prev := null;
  for r in select * from audit_log where row_hash is not null order by id asc loop
    _exp := encode(digest(coalesce(_prev, '') || '::' || fn_audit_content(r), 'sha256'), 'hex');
    _n := _n + 1;
    if r.row_hash <> _exp or coalesce(r.prev_hash, '') <> coalesce(_prev, '') then
      _broken := r.id;
      exit;
    end if;
    _prev := r.row_hash;
  end loop;
  return query select (_broken is null), _n, _broken;
end $$;
