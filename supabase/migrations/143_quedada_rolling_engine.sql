-- 143 · Motor ROLLING/continuo del Americano de Quedadas.
--
-- Agrega un modo de motor por quedada y relaja el modelo de "ronda" para soportar
-- asignación CONTINUA por cancha: cada cancha es una ranura con un partido activo;
-- al reportar el marcador (la cancha se libera) el motor asigna el siguiente
-- emparejamiento en ESA cancha.
--
--   engine_mode = 'rounds'  (default) → comportamiento de la mig 141 (rondas completas).
--   engine_mode = 'rolling'           → continuo por cancha (sin ronda global).
--
-- En rolling los games NO pertenecen a una ronda global, así que round_id/round_no
-- pasan a nullable. El orden cronológico sale de created_at; cada cancha lleva su
-- propio contador (court_match_no) como referencia para el organizador
-- ("Cancha 3 · Partido 5"). Los standings siguen derivándose de los games played
-- (no dependen de la ronda) → no se rompen.

alter table public.quedadas
  add column if not exists engine_mode text not null default 'rounds';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quedadas_engine_mode_chk') then
    alter table public.quedadas
      add constraint quedadas_engine_mode_chk check (engine_mode in ('rounds', 'rolling'));
  end if;
end $$;

alter table public.quedada_games alter column round_id drop not null;
alter table public.quedada_games alter column round_no drop not null;

alter table public.quedada_games
  add column if not exists court_match_no int;
