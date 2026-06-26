-- 20260702100000 · Audit hardening: RLS en rate_limit_buckets, search_path,
-- índices calientes, tg_audit en tablas financieras sin trigger.
-- Ola 0 del roadmap post-auditoría 2026-06-26.

-- ── RLS en rate_limit_buckets (P1 #3) ────────────────────────────────────
-- Deny-all: solo service-role accede (como payment_webhook_events).
alter table rate_limit_buckets enable row level security;

-- ── search_path en fn_purge_expired_idempotency (P2 RLS) ─────────────────
-- Era el único SECURITY DEFINER sin search_path fijo de los 124 existentes.
create or replace function fn_purge_expired_idempotency() returns void
language sql security definer set search_path = public as $$
  delete from idempotency_keys where expires_at < now();
$$;

-- ── Índices en tablas calientes (P1 #9) ──────────────────────────────────
create index if not exists idx_registrations_tournament_id
  on registrations(tournament_id);

create index if not exists idx_registrations_tournament_cat_status
  on registrations(tournament_id, category_id, status);

create index if not exists idx_brackets_tournament_id
  on brackets(tournament_id);

create index if not exists idx_tgm_side_a
  on tournament_group_matches(side_a_registration_id);

create index if not exists idx_tgm_side_b
  on tournament_group_matches(side_b_registration_id);

create index if not exists idx_tgm_court_id
  on tournament_group_matches(court_id);

-- ── tg_audit en tablas sin trigger (P1 #10) ──────────────────────────────
drop trigger if exists tg_audit_payouts on payouts;
create trigger tg_audit_payouts
  after insert or update or delete on payouts
  for each row execute function tg_audit();

drop trigger if exists tg_audit_user_suspensions on user_suspensions;
create trigger tg_audit_user_suspensions
  after insert or update or delete on user_suspensions
  for each row execute function tg_audit();

drop trigger if exists tg_audit_coach_commissions on coach_commissions;
create trigger tg_audit_coach_commissions
  after insert or update or delete on coach_commissions
  for each row execute function tg_audit();
