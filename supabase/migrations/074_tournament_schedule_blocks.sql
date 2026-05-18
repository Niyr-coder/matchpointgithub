-- Bloques de cronograma editables por el partner organizador.
-- Cada bloque representa una entrada en la agenda pública del torneo,
-- ej. "Sábado 10:00 — Categoría B fase grupos". Liviano: sin canchas ni
-- referees todavía. category_id opcional (bloques generales como "ceremonia").
create table if not exists public.tournament_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  category_id uuid references public.tournament_categories(id) on delete set null,
  starts_at timestamptz not null,
  label text not null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index if not exists idx_tournament_schedule_blocks_tournament
  on public.tournament_schedule_blocks (tournament_id, starts_at);

alter table public.tournament_schedule_blocks enable row level security;

-- SELECT público: cualquiera puede ver el cronograma del torneo (es info
-- que también muestra la landing page para los jugadores).
drop policy if exists tsb_public_select on public.tournament_schedule_blocks;
create policy tsb_public_select on public.tournament_schedule_blocks
  for select using (true);

-- Mutación: solo admin global o partner_member del torneo. La validación
-- real la hace la server action via service role — esta policy es solo
-- defensa en profundidad (RLS bloquea inserts directos vía anon key).
drop policy if exists tsb_admin_all on public.tournament_schedule_blocks;
create policy tsb_admin_all on public.tournament_schedule_blocks
  for all using (mp_is_admin()) with check (mp_is_admin());
