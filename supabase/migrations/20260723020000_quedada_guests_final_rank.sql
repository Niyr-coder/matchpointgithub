-- 2026-07-23 · Walk-ins en el podio: quedada_guests.final_rank.
-- writeCategoryPodiumRanks y setQuedadaResults escribían final_rank solo en
-- quedada_participants; si una pareja con walk-in ganaba, su puesto se perdía
-- (el podio de Gestión la omitía). Los guests guardan su rank aquí.
alter table public.quedada_guests
  add column if not exists final_rank int check (final_rank is null or final_rank >= 1);
