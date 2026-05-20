-- 131 · Quedadas (juego social) — Stage 1 backend.
-- Entidad social casual, distinta de torneos: un user organiza una junta con un
-- formato (americano/mexicano/round_robin/kotc/canguil/libre), abierta (cuota +
-- cupo) o privada (amigos). v1 = organizar + resultados casuales (sin ranking ni
-- motor en vivo; eso es v2). El schema ya lleva format + match_mode + resultados
-- por participante para que v2 (ranked + stats por formato×modo) construya encima.

-- ── Enum de formato ──────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'mp_quedada_format') then
    create type public.mp_quedada_format as enum
      ('americano','mexicano','round_robin','kotc','canguil','libre');
  end if;
end $$;

-- ── quedadas ─────────────────────────────────────────────────────────────────
create table if not exists public.quedadas (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,            -- sede opcional
  reservation_id uuid references public.reservations(id) on delete set null, -- cancha opcional
  title text not null,
  description text,
  format public.mp_quedada_format not null,
  match_mode public.mp_match_mode not null default 'doubles',  -- singles/dobles (v2 stats)
  visibility text not null default 'open' check (visibility in ('open','private')),
  status public.mp_event_status not null default 'registration_open',
  starts_at timestamptz not null,
  location_text text,
  max_players int check (max_players is null or max_players >= 2),
  fee_cents int not null default 0 check (fee_cents >= 0),
  perks_text text,
  ranked boolean not null default false,  -- v1 siempre false; v2 con aprobación del club
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quedadas_status_starts on public.quedadas (status, starts_at desc);
create index if not exists idx_quedadas_creator on public.quedadas (creator_id);
create index if not exists idx_quedadas_club on public.quedadas (club_id);

-- ── quedada_participants ─────────────────────────────────────────────────────
create table if not exists public.quedada_participants (
  quedada_id uuid not null references public.quedadas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'joined' check (status in ('joined','waitlist','cancelled','invited')),
  paid_transaction_id uuid references public.transactions(id) on delete set null,
  points int,        -- standings casuales v1 (los ingresa el organizador al cerrar)
  final_rank int,
  joined_at timestamptz not null default now(),
  primary key (quedada_id, user_id)
);
create index if not exists idx_quedada_participants_user on public.quedada_participants (user_id);

-- ── quedada_reports (soporte/moderación) ─────────────────────────────────────
create table if not exists public.quedada_reports (
  id uuid primary key default gen_random_uuid(),
  quedada_id uuid not null references public.quedadas(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_quedada_reports_status on public.quedada_reports (status);

-- ── transactions.kind: +quedada (cuota de inscripción abierta) ───────────────
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check
  check (kind in (
    'reservation','class','proshop_sale','event','tournament','custom',
    'plan','club_featuring','quedada'
  ));

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.quedadas enable row level security;

drop policy if exists quedadas_select on public.quedadas;
create policy quedadas_select on public.quedadas for select using (
  visibility = 'open'
  or creator_id = auth.uid()
  or exists (select 1 from public.quedada_participants p where p.quedada_id = id and p.user_id = auth.uid())
  or (auth.jwt() ->> 'role' = 'admin')
);
drop policy if exists quedadas_insert on public.quedadas;
create policy quedadas_insert on public.quedadas for insert with check (creator_id = auth.uid());
drop policy if exists quedadas_update on public.quedadas;
create policy quedadas_update on public.quedadas for update using (creator_id = auth.uid() or auth.jwt() ->> 'role' = 'admin');
drop policy if exists quedadas_delete on public.quedadas;
create policy quedadas_delete on public.quedadas for delete using (creator_id = auth.uid() or auth.jwt() ->> 'role' = 'admin');

alter table public.quedada_participants enable row level security;

drop policy if exists qp_select on public.quedada_participants;
create policy qp_select on public.quedada_participants for select using (
  user_id = auth.uid()
  or exists (select 1 from public.quedadas q where q.id = quedada_id and (q.creator_id = auth.uid() or q.visibility = 'open'))
  or auth.jwt() ->> 'role' = 'admin'
);
drop policy if exists qp_insert on public.quedada_participants;
create policy qp_insert on public.quedada_participants for insert with check (
  user_id = auth.uid()
  or exists (select 1 from public.quedadas q where q.id = quedada_id and q.creator_id = auth.uid())
);
drop policy if exists qp_update on public.quedada_participants;
create policy qp_update on public.quedada_participants for update using (
  user_id = auth.uid()
  or exists (select 1 from public.quedadas q where q.id = quedada_id and q.creator_id = auth.uid())
  or auth.jwt() ->> 'role' = 'admin'
);
drop policy if exists qp_delete on public.quedada_participants;
create policy qp_delete on public.quedada_participants for delete using (
  user_id = auth.uid()
  or exists (select 1 from public.quedadas q where q.id = quedada_id and q.creator_id = auth.uid())
  or auth.jwt() ->> 'role' = 'admin'
);

alter table public.quedada_reports enable row level security;
drop policy if exists qr_insert on public.quedada_reports;
create policy qr_insert on public.quedada_reports for insert with check (reporter_id = auth.uid());
drop policy if exists qr_admin on public.quedada_reports;
create policy qr_admin on public.quedada_reports for all using (auth.jwt() ->> 'role' = 'admin');

-- ── Audit triggers ────────────────────────────────────────────────────────────
drop trigger if exists tg_audit_quedadas on public.quedadas;
create trigger tg_audit_quedadas after insert or update or delete on public.quedadas
  for each row execute function tg_audit();
drop trigger if exists tg_audit_quedada_participants on public.quedada_participants;
create trigger tg_audit_quedada_participants after insert or update or delete on public.quedada_participants
  for each row execute function tg_audit();
drop trigger if exists tg_audit_quedada_reports on public.quedada_reports;
create trigger tg_audit_quedada_reports after insert or update or delete on public.quedada_reports
  for each row execute function tg_audit();

-- ── Realtime (cupos/RSVP en vivo) ─────────────────────────────────────────────
alter publication supabase_realtime add table public.quedadas;
alter publication supabase_realtime add table public.quedada_participants;

-- ── Notification kinds ─────────────────────────────────────────────────────────
insert into public.notification_kinds (kind, description, allowed_roles, default_channels, category) values
  ('quedada_invite',    'Te invitaron a una quedada',               array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'social'),
  ('quedada_joined',    'Alguien se unió a tu quedada',             array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'social'),
  ('quedada_reminder',  'Tu quedada es pronto',                     array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'social'),
  ('quedada_cancelled', 'Se canceló una quedada en la que estabas', array['user']::mp_role[], array['inapp']::mp_notification_channel[], 'social')
on conflict (kind) do nothing;
