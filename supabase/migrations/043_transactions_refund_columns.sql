-- 042 · Refund metadata on transactions (manual refunds, no PSP).
-- MatchPoint no usa Stripe ni PSP: los reembolsos son manuales.
-- El admin marca la transaction como `refunded` con motivo + referencia
-- de la transferencia bancaria/DeUna que hace fuera de la app.
--
-- Columnas añadidas:
--   refund_reason     · motivo obligatorio escrito por el admin.
--   refund_reference  · número/hash de la transferencia (opcional).
--   refunded_at       · timestamp del cambio.
--   refunded_by       · profile del admin que marcó el reembolso.
--
-- El audit_log se llena automáticamente por el trigger tg_audit aplicado
-- a `transactions` en 099_audit_triggers.sql.

alter table transactions
  add column if not exists refund_reason text,
  add column if not exists refund_reference text,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid references profiles(id);

create index if not exists idx_transactions_refunded_at
  on transactions (refunded_at desc)
  where refunded_at is not null;
