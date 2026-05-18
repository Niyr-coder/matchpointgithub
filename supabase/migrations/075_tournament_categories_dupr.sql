-- Categorías: rating DUPR (2.0-8.0) en vez del enum mp_skill_level rígido.
-- Mantenemos `level` por compatibilidad con código legacy, pero el front nuevo
-- usa dupr_min/dupr_max con dos thumbs. Un categoría puede tener:
--   dupr_min=3.0, dupr_max=4.0  →  "DUPR 3.0-4.0"
--   dupr_min=5.5, dupr_max=NULL →  "DUPR 5.5+"
--   ambos NULL                  →  sin restricción de nivel (open)
alter table public.tournament_categories
  add column if not exists dupr_min numeric(3,2),
  add column if not exists dupr_max numeric(3,2);

comment on column public.tournament_categories.dupr_min is
  'Rating DUPR mínimo de la categoría (2.0-8.0). NULL = sin piso.';
comment on column public.tournament_categories.dupr_max is
  'Rating DUPR máximo de la categoría. NULL = sin tope ("5.5+").';

alter table public.tournament_categories
  drop constraint if exists tc_dupr_range_chk;
alter table public.tournament_categories
  add constraint tc_dupr_range_chk check (
    (dupr_min is null or (dupr_min >= 2.0 and dupr_min <= 8.0)) and
    (dupr_max is null or (dupr_max >= 2.0 and dupr_max <= 8.0)) and
    (dupr_min is null or dupr_max is null or dupr_min <= dupr_max)
  );
