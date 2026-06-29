-- Agrega columna payout_account a partner_orgs para que el partner
-- registre sus datos bancarios y admin pueda procesarle payouts.
-- Misma estructura que quedadas.payment_account (jsonb, mismos campos).
-- No se agrega RLS de UPDATE: el server action usa getAdminClient()
-- tras validar que el usuario es partner-admin, igual que partner_club_links.

alter table partner_orgs
  add column if not exists payout_account jsonb;
