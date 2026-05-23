-- 144 · Quedadas — check-in de asistencia + cooldown del aviso de pago.
--
-- check_in es MERAMENTE INFORMATIVO para el organizador (no bloquea el motor de
-- emparejamiento ni el pago). Un jugador sin check-in puede jugar igual; si no
-- asistió, el organizador lo reporta con el flujo de reportes existente.
--
-- payment_reminded_at = última vez que se le envió el aviso de pago (cooldown de
-- 30 min para no spamear). Lo setea la action remindQuedadaPayment.

alter table public.quedada_participants
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references public.profiles(id) on delete set null,
  add column if not exists payment_reminded_at timestamptz;

-- Lookup de presentes por quedada (para stats de asistencia).
create index if not exists idx_quedada_participants_checked_in
  on public.quedada_participants (quedada_id)
  where checked_in_at is not null;

-- RLS: el update de estas columnas lo cubre la policy qp_update existente
-- (mig 133: self O mp_quedada_can_manage O admin). No se agregan policies nuevas.
-- Realtime: quedada_participants ya está en supabase_realtime (mig 131).
-- Audit: el trigger tg_audit_quedada_participants ya cubre los UPDATE.
