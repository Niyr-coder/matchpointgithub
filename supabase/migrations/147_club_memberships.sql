-- 147 · Membresías VIP por club (tarjetas de membresía).
--
-- Modelo (mirror de player_subscriptions / MATCHPOINT+, pero scopeado a un club):
--   - club_membership_tiers: los niveles que define cada club (precio, duración,
--     descuento, beneficios, diseño de tarjeta).
--   - club_memberships: la membresía de un usuario en un club (pending → active →
--     expired/cancelled), con member_no correlativo POR CLUB.
--   - Pago sin PSP: cuota por transferencia/DeUna; el comprobante lo aprueba el
--     OWNER/MANAGER del club (no el admin de plataforma). transactions.kind nuevo.
--
-- Renovación: extiende desde el vencimiento vigente (no resetea), como MP+.

-- ── transactions.kind += club_membership ─────────────────────────────────────
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check
  check (kind in (
    'reservation','class','proshop_sale','event','tournament','custom',
    'plan','club_featuring','quedada','club_membership'
  ));

-- ── club_membership_tiers ────────────────────────────────────────────────────
create table if not exists public.club_membership_tiers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  description text,
  price_cents int not null default 0 check (price_cents >= 0),
  duration_months int not null default 1 check (duration_months > 0),
  discount_pct int not null default 0 check (discount_pct between 0 and 100),
  benefits jsonb not null default '[]'::jsonb,        -- ["Acceso solo-miembros", ...]
  card_design jsonb not null default '{}'::jsonb,     -- { templateKey, accent? }
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_club_membership_tiers_club on public.club_membership_tiers (club_id, sort_order);

-- ── club_memberships ─────────────────────────────────────────────────────────
create table if not exists public.club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tier_id uuid references public.club_membership_tiers(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','active','expired','cancelled','rejected')),
  member_no int,                       -- correlativo por club; se asigna al activar
  starts_at timestamptz,
  expires_at timestamptz,
  transaction_id uuid references public.transactions(id) on delete set null,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Una membresía "viva" (no terminal) por usuario×club; las históricas quedan.
create unique index if not exists uq_club_membership_live
  on public.club_memberships (club_id, user_id)
  where status in ('pending','active');
create index if not exists idx_club_memberships_user on public.club_memberships (user_id);
create index if not exists idx_club_memberships_club_status on public.club_memberships (club_id, status);
create unique index if not exists uq_club_membership_member_no
  on public.club_memberships (club_id, member_no)
  where member_no is not null;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.club_membership_tiers enable row level security;
drop policy if exists cmt_select on public.club_membership_tiers;
create policy cmt_select on public.club_membership_tiers for select using (
  is_active or public.mp_club_staff(club_id)
);
drop policy if exists cmt_write on public.club_membership_tiers;
create policy cmt_write on public.club_membership_tiers for all using (
  public.mp_club_staff(club_id)
) with check (
  public.mp_club_staff(club_id)
);

alter table public.club_memberships enable row level security;
drop policy if exists cm_select on public.club_memberships;
create policy cm_select on public.club_memberships for select using (
  user_id = auth.uid() or public.mp_club_staff(club_id)
);
-- El usuario crea su propia membresía 'pending' al comprar.
drop policy if exists cm_insert on public.club_memberships;
create policy cm_insert on public.club_memberships for insert with check (
  user_id = auth.uid() or public.mp_club_staff(club_id)
);
-- Aprobar/revocar/renovar = staff del club (o admin vía mp_club_staff).
drop policy if exists cm_update on public.club_memberships;
create policy cm_update on public.club_memberships for update using (
  public.mp_club_staff(club_id)
);
drop policy if exists cm_delete on public.club_memberships;
create policy cm_delete on public.club_memberships for delete using (
  public.mp_club_staff(club_id)
);

-- ── Audit ──────────────────────────────────────────────────────────────────
drop trigger if exists tg_audit_club_membership_tiers on public.club_membership_tiers;
create trigger tg_audit_club_membership_tiers after insert or update or delete on public.club_membership_tiers
  for each row execute function tg_audit();
drop trigger if exists tg_audit_club_memberships on public.club_memberships;
create trigger tg_audit_club_memberships after insert or update or delete on public.club_memberships
  for each row execute function tg_audit();

-- ── Realtime (activación en vivo + cola del club) ────────────────────────────
alter publication supabase_realtime add table public.club_memberships;
