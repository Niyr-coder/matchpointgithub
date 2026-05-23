-- 154 · Hash chain en audit_log (tamper-evident / a prueba de manipulación).
-- Cada fila guarda row_hash = sha256(prev_hash || contenido canónico de la fila).
-- Si alguien altera o borra una fila vieja (incluso con acceso a la base), los
-- hashes de las filas siguientes dejan de cuadrar → detectable con
-- fn_verify_audit_chain(). Ver docs/security/03-audit-log.md.

create extension if not exists pgcrypto;

alter table audit_log
  add column if not exists prev_hash text,
  add column if not exists row_hash text;

-- Contenido canónico determinista de una fila (excluye prev_hash/row_hash).
-- jsonb ordena las claves al serializar → ::text es estable.
create or replace function fn_audit_content(_r audit_log) returns text
language sql immutable as $$
  select (jsonb_build_object(
    'actor', _r.actor_id, 'role', _r.actor_role, 'club', _r.club_id,
    'entity', _r.entity, 'entity_id', _r.entity_id, 'action', _r.action,
    'diff', _r.diff, 'ip', _r.ip, 'ua', _r.ua, 'ts', _r.created_at
  ))::text;
$$;

-- BEFORE INSERT en audit_log: encadena el hash con el de la fila anterior.
-- El advisory lock serializa los inserts concurrentes (la cadena necesita orden).
-- SECURITY DEFINER para poder leer audit_log sin chocar con RLS.
create or replace function tg_audit_chain() returns trigger
language plpgsql security definer set search_path = public as $$
declare _prev text;
begin
  perform pg_advisory_xact_lock(hashtext('audit_log_chain')::bigint);
  select row_hash into _prev from audit_log order by id desc limit 1;
  new.prev_hash := _prev;
  new.row_hash := encode(digest(coalesce(_prev, '') || '::' || fn_audit_content(new), 'sha256'), 'hex');
  return new;
end $$;

drop trigger if exists tg_audit_chain on audit_log;
create trigger tg_audit_chain before insert on audit_log
  for each row execute function tg_audit_chain();

-- Backfill: recalcula la cadena sobre el log existente, en orden de id.
do $$
declare r audit_log%rowtype; _prev text; _h text;
begin
  _prev := null;
  for r in select * from audit_log order by id asc loop
    _h := encode(digest(coalesce(_prev, '') || '::' || fn_audit_content(r), 'sha256'), 'hex');
    update audit_log set prev_hash = _prev, row_hash = _h where id = r.id;
    _prev := _h;
  end loop;
end $$;

-- Verificación: recorre la cadena y devuelve si está íntegra + cuántas verificó
-- + el id de la primera fila rota (si la hay). Solo admin.
create or replace function fn_verify_audit_chain()
returns table(ok boolean, checked bigint, broken_id bigint)
language plpgsql security definer set search_path = public as $$
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
grant execute on function fn_verify_audit_chain() to authenticated;

comment on column audit_log.row_hash is 'sha256(prev_hash || contenido) — eslabón de la cadena de integridad. Lo setea tg_audit_chain.';
comment on column audit_log.prev_hash is 'row_hash de la fila anterior. NULL solo en la primera fila de la cadena.';
