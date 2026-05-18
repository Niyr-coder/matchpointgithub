-- Premios personalizados por torneo: lista con puesto + label libre + valor
-- opcional + patrocinador opcional. Reemplaza la granularidad del campo
-- escalar tournaments.prize_pool_cents (que se sigue manteniendo como total).
create table if not exists public.tournament_prizes (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  position int not null default 0,
  place_label text not null,
  prize_label text not null,
  value_cents int,
  sponsor text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tournament_prizes_tournament
  on public.tournament_prizes (tournament_id, position);

alter table public.tournament_prizes enable row level security;

drop policy if exists tp_public_select on public.tournament_prizes;
create policy tp_public_select on public.tournament_prizes for select using (true);

drop policy if exists tp_admin_all on public.tournament_prizes;
create policy tp_admin_all on public.tournament_prizes
  for all using (mp_is_admin()) with check (mp_is_admin());

comment on table public.tournament_prizes is
  'Lista de premios personalizada del torneo. Reemplaza al campo escalar prize_pool_cents en cuanto a granularidad — el partner define puestos y premios libres con valor y patrocinador opcional.';
