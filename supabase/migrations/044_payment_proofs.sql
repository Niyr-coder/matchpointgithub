-- 043 · Payment proofs (comprobantes de transferencia/DeUna)
--
-- MatchPoint no usa PSP. Los pagos se realizan por transferencia bancaria o
-- DeUna (wallet ecuatoriano). El usuario sube un comprobante (imagen o PDF),
-- el admin lo valida manualmente y marca la transacción como `captured`.
--
-- Estados nuevos del enum mp_payment_status:
--   - 'pending_proof'    → la transacción está creada pero el usuario aún no
--                          ha subido el comprobante (o lo rechazaron y debe
--                          volver a subir).
--   - 'proof_submitted'  → el usuario subió el comprobante; espera revisión
--                          del admin.
-- Estados ya existentes que seguimos usando:
--   - 'captured'         → admin aprobó el comprobante.
--   - 'failed'           → admin rechazó definitivamente (no usado todavía;
--                          el flujo de rechazo regresa a 'pending_proof' para
--                          permitir re-upload).
--
-- Columnas nuevas en `transactions`:
--   - proof_url               text       URL/path del comprobante en storage
--   - proof_submitted_at      timestamptz cuándo lo subió el usuario
--   - proof_reviewed_by       uuid       admin que revisó
--   - proof_reviewed_at       timestamptz cuándo se revisó
--   - proof_rejection_reason  text       motivo si fue rechazado
--
-- Bucket de storage: `payment_proofs` (privado). Convención de path:
--   `{userId}/{transactionId}/proof-{timestamp}.{ext}`
-- RLS: el usuario puede insertar/leer los suyos (primer segmento del path
-- debe coincidir con auth.uid()); los admins pueden leer todos.

-- ── 1. Enum: añadir nuevos estados ──────────────────────────────────────
-- ALTER TYPE ... ADD VALUE debe correr fuera de transacción para Postgres
-- modernos, pero en migrations de supabase corren autocommit-ish; si fallara,
-- se debe splitear este bloque en su propio archivo.
alter type mp_payment_status add value if not exists 'pending_proof';
alter type mp_payment_status add value if not exists 'proof_submitted';

-- ── 2. Columnas nuevas en transactions ──────────────────────────────────
-- Verificado contra el schema remoto el 2026-05-17: ninguna de estas columnas
-- existe actualmente.
alter table public.transactions
  add column proof_url               text,
  add column proof_submitted_at      timestamptz,
  add column proof_reviewed_by       uuid references auth.users(id),
  add column proof_reviewed_at       timestamptz,
  add column proof_rejection_reason  text;

create index idx_transactions_proof_pending
  on public.transactions (created_at desc)
  where status = 'proof_submitted';

-- ── 3. Bucket payment_proofs (privado) ──────────────────────────────────
insert into storage.buckets (id, name, public)
values ('payment_proofs', 'payment_proofs', false)
on conflict (id) do nothing;

-- RLS de storage.objects para el bucket. Convención: el primer segmento del
-- path debe ser el userId que sube. Admins (mp_is_admin) pueden leer todo.
drop policy if exists "payment_proofs_owner_insert" on storage.objects;
create policy "payment_proofs_owner_insert" on storage.objects for insert
  with check (
    bucket_id = 'payment_proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "payment_proofs_owner_select" on storage.objects;
create policy "payment_proofs_owner_select" on storage.objects for select
  using (
    bucket_id = 'payment_proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "payment_proofs_owner_update" on storage.objects;
create policy "payment_proofs_owner_update" on storage.objects for update
  using (
    bucket_id = 'payment_proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "payment_proofs_admin_select" on storage.objects;
create policy "payment_proofs_admin_select" on storage.objects for select
  using (bucket_id = 'payment_proofs' and public.mp_is_admin());
