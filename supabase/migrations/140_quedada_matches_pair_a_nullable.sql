-- 140: pair_a_id nullable en quedada_matches.
--
-- La fase final de medallas (mig 139) crea los partidos del cuadro ANTES de
-- conocer a los clasificados: la final y el 3er puesto arrancan con ambas
-- parejas en null y se rellenan a medida que avanzan los ganadores. El
-- esquema original exigía pair_a_id NOT NULL (cuando solo existían partidos de
-- grupo, siempre con pareja A). Se relaja para soportar el cuadro.
alter table public.quedada_matches
  alter column pair_a_id drop not null;
