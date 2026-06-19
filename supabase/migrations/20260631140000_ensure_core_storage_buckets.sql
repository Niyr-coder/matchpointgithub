-- Buckets base para uploads del cliente (035) y solicitud de club.
-- Antes solo existían policies; en proyectos nuevos faltaban los buckets
-- y Storage respondía "Bucket not found".
-- Idempotente: on conflict do nothing.

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('club-covers', 'club-covers', false),
  ('club-courts', 'club-courts', true),
  ('resources', 'resources', false),
  ('tickets-attachments', 'tickets-attachments', false),
  ('kyc-docs', 'kyc-docs', false),
  ('clubs', 'clubs', true),
  ('payment_proofs', 'payment_proofs', false)
on conflict (id) do nothing;
