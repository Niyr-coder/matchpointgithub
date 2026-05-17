-- 046 · Eventos/torneos pagos: estado pending_payment + transactions sin club.
--
-- Cuando el usuario se inscribe a un evento con price_cents > 0:
--   - registerToEvent crea una `transactions` (status='pending_proof') y
--     marca la `event_registrations` como 'pending_payment' hasta que el
--     admin apruebe el comprobante (entonces pasa a 'registered').
--   - Para torneos, `registrations.status` ya tenía 'pending' como inicial,
--     no requiere CHECK adicional.
--
-- Eventos sin club (organizados por MatchPoint, club_id null) también deben
-- poder cobrar → `transactions.club_id` deja de ser NOT NULL.

alter table public.event_registrations
  drop constraint if exists event_registrations_status_check;
alter table public.event_registrations
  add constraint event_registrations_status_check
  check (status = any (array['registered','cancelled','attended','no_show','pending_payment']::text[]));

alter table public.transactions
  alter column club_id drop not null;
