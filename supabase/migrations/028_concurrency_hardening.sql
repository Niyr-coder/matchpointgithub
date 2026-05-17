-- 028 · Concurrency hardening: idempotency, rate-limit buckets, optimistic locking.

-- ── Idempotency keys ────────────────────────────────────────────────────
-- When a Server Action receives an `idempotency_key`, we store the resulting
-- response. A retry with the same key returns the cached response instead of
-- re-executing the side effect (double-click protection, retry storms).
create table idempotency_keys (
  key text not null,
  user_id uuid not null references profiles(id) on delete cascade,
  scope text not null,                       -- 'createReservation', 'createApplication', etc.
  request_hash text,                         -- sha256 of normalized input; rejects key reuse with different body
  status_code int not null,
  response jsonb not null,
  created_at timestamptz default now() not null,
  expires_at timestamptz default (now() + interval '24 hours') not null,
  primary key (user_id, scope, key)
);

create index idx_idempotency_expiry on idempotency_keys (expires_at);

alter table idempotency_keys enable row level security;
create policy idem_self on idempotency_keys for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- pg_cron cleanup hourly (registered separately if pg_cron is enabled)
create or replace function fn_purge_expired_idempotency() returns void
language sql security definer as $$
  delete from idempotency_keys where expires_at < now();
$$;

-- ── Rate limit buckets ─────────────────────────────────────────────────
-- Token bucket per (key, scope). `key` is usually user_id or IP.
create table rate_limit_buckets (
  bucket_key text not null,                  -- e.g. 'auth:signup:1.2.3.4' or 'reserve:<userId>'
  capacity int not null,                     -- max tokens
  tokens numeric not null,                   -- current tokens (decimal so refill math is smooth)
  refill_per_second numeric not null,
  refilled_at timestamptz not null default now(),
  primary key (bucket_key)
);

-- Atomic consume function: returns true if the request is allowed.
-- Called via supabase.rpc('fn_rate_limit_consume', { ... }).
create or replace function fn_rate_limit_consume(
  p_key text,
  p_capacity int,
  p_refill_per_second numeric,
  p_cost numeric default 1
) returns table(allowed boolean, remaining numeric, retry_after_seconds numeric)
language plpgsql security definer set search_path = public as $$
declare
  _row rate_limit_buckets%rowtype;
  _elapsed numeric;
  _new_tokens numeric;
begin
  insert into rate_limit_buckets (bucket_key, capacity, tokens, refill_per_second)
  values (p_key, p_capacity, p_capacity, p_refill_per_second)
  on conflict (bucket_key) do nothing;

  select * into _row from rate_limit_buckets where bucket_key = p_key for update;

  _elapsed := extract(epoch from (now() - _row.refilled_at));
  _new_tokens := least(_row.capacity::numeric, _row.tokens + (_elapsed * _row.refill_per_second));

  if _new_tokens >= p_cost then
    update rate_limit_buckets
      set tokens = _new_tokens - p_cost,
          refilled_at = now(),
          capacity = p_capacity,
          refill_per_second = p_refill_per_second
      where bucket_key = p_key;
    return query select true, _new_tokens - p_cost, 0::numeric;
  else
    update rate_limit_buckets
      set tokens = _new_tokens,
          refilled_at = now()
      where bucket_key = p_key;
    return query select false, _new_tokens,
      ((p_cost - _new_tokens) / nullif(_row.refill_per_second, 0))::numeric;
  end if;
end $$;

grant execute on function fn_rate_limit_consume(text, int, numeric, numeric) to authenticated, anon;

-- No RLS on the bucket table — it's only ever touched via the security-definer
-- function and never directly by clients.
revoke all on rate_limit_buckets from authenticated, anon;

-- ── Optimistic locking ─────────────────────────────────────────────────
-- Add `version` to the most active mutation surfaces. Update statements
-- include `where version = $current`; if 0 rows match the caller gets a
-- 409 CONCURRENT_UPDATE.

alter table club_applications
  add column version int not null default 1;

alter table reservations
  add column version int not null default 1;

alter table clubs
  add column version int not null default 1;

-- Trigger to bump version on every update. Skips when the only change is to
-- `version` itself (set by application code) — that path is reserved for the
-- conditional UPDATE pattern, which sets version = version + 1 explicitly.
create or replace function tg_bump_version() returns trigger
language plpgsql as $$
begin
  if new.version = old.version then
    new.version = old.version + 1;
  end if;
  return new;
end $$;

create trigger tg_club_applications_version before update on club_applications
  for each row execute function tg_bump_version();

create trigger tg_reservations_version before update on reservations
  for each row execute function tg_bump_version();

create trigger tg_clubs_version before update on clubs
  for each row execute function tg_bump_version();
