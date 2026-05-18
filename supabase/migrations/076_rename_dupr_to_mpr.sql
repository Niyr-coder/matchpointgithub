-- MPR = MatchPoint Rating. Es el rating propio de la plataforma. Reemplaza
-- el naming inicial DUPR (escala de pickleball externa) — mismo rango 2.0-8.0
-- pero brandeado como nuestro.
alter table public.tournament_categories rename column dupr_min to mpr_min;
alter table public.tournament_categories rename column dupr_max to mpr_max;

alter table public.tournament_categories
  drop constraint if exists tc_dupr_range_chk;
alter table public.tournament_categories
  add constraint tc_mpr_range_chk check (
    (mpr_min is null or (mpr_min >= 2.0 and mpr_min <= 8.0)) and
    (mpr_max is null or (mpr_max >= 2.0 and mpr_max <= 8.0)) and
    (mpr_min is null or mpr_max is null or mpr_min <= mpr_max)
  );

comment on column public.tournament_categories.mpr_min is
  'Rating MPR mínimo (MatchPoint Rating, escala 2.0-8.0). NULL = sin piso.';
comment on column public.tournament_categories.mpr_max is
  'Rating MPR máximo. NULL = sin tope ("5.5+").';
