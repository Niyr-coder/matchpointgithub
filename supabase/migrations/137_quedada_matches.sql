-- 137: Motor de juego de quedadas (v2) — partidos por ronda con puntos.
--
-- Unificado para todos los formatos: rondas de partidos (pareja A vs pareja B),
-- cada partido suma puntos por lado; los standings se DERIVAN de los partidos
-- (append-only — nunca se recomputa un estado mutable al cambiar el roster).
-- pair_a/pair_b referencian quedada_pairs (un "equipo" de 1 o 2 jugadores).
-- status: scheduled (programado) → played (con puntos, el organizador reporta directo).

create table if not exists public.quedada_matches (
  id uuid primary key default gen_random_uuid(),
  quedada_id uuid not null references public.quedadas(id) on delete cascade,
  category_id uuid not null references public.quedada_categories(id) on delete cascade,
  round_no int not null default 1,
  pair_a_id uuid not null references public.quedada_pairs(id) on delete cascade,
  pair_b_id uuid references public.quedada_pairs(id) on delete cascade,
  points_a int,
  points_b int,
  status text not null default 'scheduled' check (status in ('scheduled', 'played')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quedada_matches_cat_idx on public.quedada_matches (category_id, round_no);
create index if not exists quedada_matches_quedada_idx on public.quedada_matches (quedada_id);

alter table public.quedada_matches enable row level security;

-- Leer: miembro de la quedada, o quedada abierta (pública), o quien gestiona.
create policy qm_select on public.quedada_matches
  for select
  using (
    public.mp_is_quedada_member(quedada_id, auth.uid())
    or public.mp_quedada_is_open(quedada_id)
    or public.mp_quedada_can_manage(quedada_id, auth.uid())
  );

-- Escribir: solo creador o co-host (gestión).
create policy qm_write on public.quedada_matches
  for all
  using (public.mp_quedada_can_manage(quedada_id, auth.uid()))
  with check (public.mp_quedada_can_manage(quedada_id, auth.uid()));

-- updated_at + realtime (panel en vivo).
create trigger tg_quedada_matches_updated_at
  before update on public.quedada_matches
  for each row execute function public.tg_set_updated_at();

alter publication supabase_realtime add table public.quedada_matches;
