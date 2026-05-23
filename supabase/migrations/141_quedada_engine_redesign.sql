-- 141 · Quedadas — rediseño del motor de juego (motor POR FORMATO).
--
-- Borra el motor viejo (molde único grupos→bracket con parejas fijas, migs
-- 137/138/139/140) y lo reemplaza por un modelo PLAYER-céntrico que modela bien
-- la rotación: en formatos como el Americano el compañero cambia cada ronda, así
-- que el "equipo" es efímero por partido (no una pareja persistente).
--
-- Stage 1 entrega AMERICANO; el resto de formatos muestran "Pronto" hasta su
-- motor. Base limpia → drop directo (final_rank vive en quedada_participants).
--
-- Modelo:
--   quedada_rounds  — una ronda de una categoría (orquestación + estado).
--   quedada_games   — un partido de la ronda, con LADOS A NIVEL JUGADOR (1-2 por
--                     lado: sirve singles y dobles). Puntos por lado; standings
--                     individuales DERIVADOS (append-only) de los games jugados.
--   Los BYES (descansos) se DERIVAN: inscritos de la categoría que no aparecen en
--   ningún game de esa ronda. Sin tabla extra.

-- ── Borrar el motor viejo ─────────────────────────────────────────────────────
-- drop table quita además sus policies, triggers y la membresía en la publication.
drop table if exists public.quedada_matches cascade;

-- ── target_points: largo del partido (a X puntos) ────────────────────────────
-- Por categoría (cada nivel puede jugar a distinto target) con fallback al de la
-- quedada; si ambos null, la action usa un default (24).
alter table public.quedadas
  add column if not exists target_points int check (target_points is null or target_points > 0);
alter table public.quedada_categories
  add column if not exists target_points int check (target_points is null or target_points > 0);

-- ── quedada_rounds ────────────────────────────────────────────────────────────
create table if not exists public.quedada_rounds (
  id uuid primary key default gen_random_uuid(),
  quedada_id uuid not null references public.quedadas(id) on delete cascade,
  category_id uuid not null references public.quedada_categories(id) on delete cascade,
  round_no int not null,
  status text not null default 'active' check (status in ('scheduled', 'active', 'done')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, round_no)
);
create index if not exists idx_quedada_rounds_category on public.quedada_rounds (category_id, round_no);
create index if not exists idx_quedada_rounds_quedada on public.quedada_rounds (quedada_id);

-- ── quedada_games ─────────────────────────────────────────────────────────────
-- Lados a nivel jugador (player-céntrico). p2 nullable = singles. Un game NUNCA
-- referencia quedada_pairs (las parejas son por-ronda en los formatos rotativos).
create table if not exists public.quedada_games (
  id uuid primary key default gen_random_uuid(),
  quedada_id uuid not null references public.quedadas(id) on delete cascade,
  category_id uuid not null references public.quedada_categories(id) on delete cascade,
  round_id uuid not null references public.quedada_rounds(id) on delete cascade,
  round_no int not null,            -- denormalizado del round (orden/calendario)
  court_no int,
  side_a_p1 uuid not null references public.profiles(id) on delete cascade,
  side_a_p2 uuid references public.profiles(id) on delete cascade,
  side_b_p1 uuid not null references public.profiles(id) on delete cascade,
  side_b_p2 uuid references public.profiles(id) on delete cascade,
  points_a int check (points_a is null or points_a >= 0),
  points_b int check (points_b is null or points_b >= 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'played')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quedada_games_round on public.quedada_games (round_id);
create index if not exists idx_quedada_games_category on public.quedada_games (category_id, round_no);
create index if not exists idx_quedada_games_quedada on public.quedada_games (quedada_id);

-- ── RLS (mismo contrato que el motor viejo) ──────────────────────────────────
-- Leer: miembro / quedada abierta / quien gestiona / admin.
-- Escribir: solo creador o co-host (gestión) / admin.
alter table public.quedada_rounds enable row level security;
drop policy if exists qr_round_select on public.quedada_rounds;
create policy qr_round_select on public.quedada_rounds for select using (
  public.mp_quedada_is_open(quedada_id)
  or public.mp_is_quedada_member(quedada_id, auth.uid())
  or public.mp_quedada_can_manage(quedada_id, auth.uid())
  or auth.jwt() ->> 'role' = 'admin'
);
drop policy if exists qr_round_write on public.quedada_rounds;
create policy qr_round_write on public.quedada_rounds for all using (
  public.mp_quedada_can_manage(quedada_id, auth.uid()) or auth.jwt() ->> 'role' = 'admin'
) with check (
  public.mp_quedada_can_manage(quedada_id, auth.uid()) or auth.jwt() ->> 'role' = 'admin'
);

alter table public.quedada_games enable row level security;
drop policy if exists qg_select on public.quedada_games;
create policy qg_select on public.quedada_games for select using (
  public.mp_quedada_is_open(quedada_id)
  or public.mp_is_quedada_member(quedada_id, auth.uid())
  or public.mp_quedada_can_manage(quedada_id, auth.uid())
  or auth.jwt() ->> 'role' = 'admin'
);
drop policy if exists qg_write on public.quedada_games;
create policy qg_write on public.quedada_games for all using (
  public.mp_quedada_can_manage(quedada_id, auth.uid()) or auth.jwt() ->> 'role' = 'admin'
) with check (
  public.mp_quedada_can_manage(quedada_id, auth.uid()) or auth.jwt() ->> 'role' = 'admin'
);

-- ── updated_at + realtime (panel + detalle jugador en vivo) ──────────────────
drop trigger if exists tg_quedada_rounds_updated_at on public.quedada_rounds;
create trigger tg_quedada_rounds_updated_at
  before update on public.quedada_rounds
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_quedada_games_updated_at on public.quedada_games;
create trigger tg_quedada_games_updated_at
  before update on public.quedada_games
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime add table public.quedada_rounds;
alter publication supabase_realtime add table public.quedada_games;
