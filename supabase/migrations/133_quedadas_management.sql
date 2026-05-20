-- 133 · Quedadas v1.x — panel de gestión: categorías, parejas/slots, pago,
-- logística de canchas, datos bancarios/premios, co-hosts, link de inscripción.

-- ── quedadas: logística + bancarios + premios + invite_code ──────────────────
alter table public.quedadas
  add column if not exists courts_count int check (courts_count is null or courts_count >= 1),
  add column if not exists hours numeric(4,1) check (hours is null or hours > 0),
  add column if not exists court_price_cents int check (court_price_cents is null or court_price_cents >= 0),
  add column if not exists payment_info text,
  add column if not exists prizes_text text,
  add column if not exists invite_code text;

create or replace function public.gen_quedada_invite_code() returns text
  language sql as $$ select substr(replace(gen_random_uuid()::text, '-', ''), 1, 10) $$;
update public.quedadas set invite_code = public.gen_quedada_invite_code() where invite_code is null;
alter table public.quedadas alter column invite_code set default public.gen_quedada_invite_code();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'quedadas_invite_code_key') then
    alter table public.quedadas add constraint quedadas_invite_code_key unique (invite_code);
  end if;
end $$;

-- ── participants: flag de pago (lo marca el organizador/co-host) ─────────────
alter table public.quedada_participants
  add column if not exists paid boolean not null default false;

-- ── categorías ───────────────────────────────────────────────────────────────
create table if not exists public.quedada_categories (
  id uuid primary key default gen_random_uuid(),
  quedada_id uuid not null references public.quedadas(id) on delete cascade,
  name text not null,
  level_label text,
  starts_at timestamptz,
  court_label text,
  max_slots int check (max_slots is null or max_slots >= 1),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_quedada_categories_quedada on public.quedada_categories (quedada_id);

-- ── parejas / slots (jugadores REGISTRADOS) ──────────────────────────────────
create table if not exists public.quedada_pairs (
  id uuid primary key default gen_random_uuid(),
  quedada_id uuid not null references public.quedadas(id) on delete cascade,
  category_id uuid not null references public.quedada_categories(id) on delete cascade,
  slot_no int not null,
  player_a_id uuid not null references public.profiles(id) on delete cascade,
  player_b_id uuid references public.profiles(id) on delete set null, -- nullable: singles / slot a medias
  created_at timestamptz not null default now(),
  unique (category_id, slot_no)
);
create index if not exists idx_quedada_pairs_quedada on public.quedada_pairs (quedada_id);
create index if not exists idx_quedada_pairs_category on public.quedada_pairs (category_id);

-- ── co-hosts (limitados a pagos + slots) ─────────────────────────────────────
create table if not exists public.quedada_cohosts (
  quedada_id uuid not null references public.quedadas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (quedada_id, user_id)
);
create index if not exists idx_quedada_cohosts_user on public.quedada_cohosts (user_id);

-- ── Helper: ¿puede gestionar pagos/slots? = creador O co-host ────────────────
create or replace function public.mp_quedada_can_manage(p_quedada uuid, p_user uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.quedadas where id = p_quedada and creator_id = p_user)
      or exists (select 1 from public.quedada_cohosts where quedada_id = p_quedada and user_id = p_user);
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Visibilidad de las sub-tablas = se puede ver la quedada (open / member / manage).
alter table public.quedada_categories enable row level security;
drop policy if exists qc_select on public.quedada_categories;
create policy qc_select on public.quedada_categories for select using (
  public.mp_quedada_is_open(quedada_id)
  or public.mp_is_quedada_member(quedada_id, auth.uid())
  or public.mp_quedada_can_manage(quedada_id, auth.uid())
  or auth.jwt() ->> 'role' = 'admin'
);
-- Categorías = solo el CREADOR (no co-hosts).
drop policy if exists qc_write on public.quedada_categories;
create policy qc_write on public.quedada_categories for all using (
  public.mp_quedada_creator(quedada_id) = auth.uid() or auth.jwt() ->> 'role' = 'admin'
);

alter table public.quedada_pairs enable row level security;
drop policy if exists qpair_select on public.quedada_pairs;
create policy qpair_select on public.quedada_pairs for select using (
  public.mp_quedada_is_open(quedada_id)
  or public.mp_is_quedada_member(quedada_id, auth.uid())
  or public.mp_quedada_can_manage(quedada_id, auth.uid())
  or auth.jwt() ->> 'role' = 'admin'
);
-- Parejas/slots = creador O co-host.
drop policy if exists qpair_write on public.quedada_pairs;
create policy qpair_write on public.quedada_pairs for all using (
  public.mp_quedada_can_manage(quedada_id, auth.uid()) or auth.jwt() ->> 'role' = 'admin'
);

alter table public.quedada_cohosts enable row level security;
drop policy if exists qch_select on public.quedada_cohosts;
create policy qch_select on public.quedada_cohosts for select using (
  public.mp_quedada_is_open(quedada_id)
  or public.mp_is_quedada_member(quedada_id, auth.uid())
  or public.mp_quedada_can_manage(quedada_id, auth.uid())
  or auth.jwt() ->> 'role' = 'admin'
);
-- Gestionar co-hosts = solo el CREADOR.
drop policy if exists qch_write on public.quedada_cohosts;
create policy qch_write on public.quedada_cohosts for all using (
  public.mp_quedada_creator(quedada_id) = auth.uid() or auth.jwt() ->> 'role' = 'admin'
);

-- participants.paid lo puede togglear el creador O co-host → ampliar qp_update.
drop policy if exists qp_update on public.quedada_participants;
create policy qp_update on public.quedada_participants for update using (
  user_id = auth.uid()
  or public.mp_quedada_can_manage(quedada_id, auth.uid())
  or auth.jwt() ->> 'role' = 'admin'
);

-- ── Audit + realtime ──────────────────────────────────────────────────────────
drop trigger if exists tg_audit_quedada_categories on public.quedada_categories;
create trigger tg_audit_quedada_categories after insert or update or delete on public.quedada_categories
  for each row execute function tg_audit();
drop trigger if exists tg_audit_quedada_pairs on public.quedada_pairs;
create trigger tg_audit_quedada_pairs after insert or update or delete on public.quedada_pairs
  for each row execute function tg_audit();
drop trigger if exists tg_audit_quedada_cohosts on public.quedada_cohosts;
create trigger tg_audit_quedada_cohosts after insert or update or delete on public.quedada_cohosts
  for each row execute function tg_audit();

alter publication supabase_realtime add table public.quedada_categories;
alter publication supabase_realtime add table public.quedada_pairs;

-- ── Notif kind ─────────────────────────────────────────────────────────────────
insert into public.notification_kinds (kind, description, allowed_roles, default_channels, category) values
  ('quedada_cohost_added', 'Te hicieron co-host de una quedada', array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'social')
on conflict (kind) do nothing;
