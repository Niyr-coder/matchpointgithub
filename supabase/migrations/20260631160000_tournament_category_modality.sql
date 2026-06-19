-- Modalidad por categoría (singles / doubles / mixed_doubles).
-- tournaments.modality sigue siendo el default global; cada fila puede override.

alter table public.tournament_categories
  add column if not exists modality mp_tournament_modality;

comment on column public.tournament_categories.modality is
  'Modalidad de juego de la categoría. Null hereda tournaments.modality.';
