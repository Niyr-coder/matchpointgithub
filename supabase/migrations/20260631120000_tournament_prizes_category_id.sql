-- Premios opcionales por categoría de torneo (null = premio general del evento).
alter table public.tournament_prizes
  add column if not exists category_id uuid references public.tournament_categories(id) on delete cascade;

create index if not exists idx_tournament_prizes_category
  on public.tournament_prizes (category_id, position);

comment on column public.tournament_prizes.category_id is
  'Categoría del torneo a la que aplica el premio. NULL = premio general (todo el evento).';
