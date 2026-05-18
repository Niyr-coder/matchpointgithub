-- 055 · Suscripciones de "featuring" pagado de clubes.
--
-- Espejo estructural de player_subscriptions (048): un club paga para
-- aparecer destacado en listings durante N días. El flujo reusa el
-- mecanismo de comprobantes (transactions kind='club_featuring'):
--
--   1. Owner del club llama requestClubFeaturing → crea transactions
--      pending_proof + club_featuring_subscriptions status='pending'.
--   2. Owner sube el comprobante en /pagos/[transactionId].
--   3. Admin aprueba → approvePaymentProofAdmin extiende
--      clubs.featured_until N días y deja la subscription en 'active'.
--
-- featured_until ya existe en clubs (migration 054). Acá solo agregamos
-- la tabla de suscripciones y, de paso, relajamos el CHECK de
-- transactions.kind para permitir 'plan' (migration 048) y
-- 'club_featuring' (esta) — el CHECK original de 010_cash.sql jamás se
-- actualizó cuando se introdujo el upgrade de plan.

-- ── transactions.kind: ampliar el set permitido ────────────────────────
alter table public.transactions
  drop constraint if exists transactions_kind_check;
alter table public.transactions
  add constraint transactions_kind_check
  check (kind in (
    'reservation','class','proshop_sale','event','tournament','custom',
    'plan','club_featuring'
  ));

-- ── club_featuring_subscriptions ───────────────────────────────────────
create table if not exists public.club_featuring_subscriptions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'cancelled', 'rejected')),
  starts_at timestamptz,
  expires_at timestamptz,
  duration_days int not null default 30 check (duration_days > 0),
  transaction_id uuid references public.transactions(id),
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_club_featuring_subs_club_status
  on public.club_featuring_subscriptions (club_id, status);
create index if not exists idx_club_featuring_subs_expires
  on public.club_featuring_subscriptions (expires_at)
  where status = 'active';

alter table public.club_featuring_subscriptions enable row level security;

-- SELECT: el solicitante, el admin, o cualquier staff/owner del club
-- (mp_club_staff cubre owner + admin). Igual incluimos requested_by
-- explícitamente por si en el futuro hay solicitudes hechas por un
-- usuario que ya no es staff.
drop policy if exists "club_featuring_subs_select" on public.club_featuring_subscriptions;
create policy "club_featuring_subs_select" on public.club_featuring_subscriptions
  for select using (
    requested_by = auth.uid()
    or public.mp_is_admin()
    or public.mp_club_staff(club_id)
  );

-- INSERT: el usuario autenticado solo puede insertar registros a su
-- propio nombre. La validación de "es owner/staff del club" se hace en
-- la server action; acá solo evitamos suplantación de requested_by.
drop policy if exists "club_featuring_subs_insert" on public.club_featuring_subscriptions;
create policy "club_featuring_subs_insert" on public.club_featuring_subscriptions
  for insert with check (requested_by = auth.uid());

-- UPDATE: solo admin (transiciones de estado las hace el flujo de
-- aprobación de comprobantes).
drop policy if exists "club_featuring_subs_admin_update" on public.club_featuring_subscriptions;
create policy "club_featuring_subs_admin_update" on public.club_featuring_subscriptions
  for update using (public.mp_is_admin());
