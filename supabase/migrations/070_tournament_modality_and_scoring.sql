-- Modalidad de juego (singles, dobles, mixed) + configuración de scoring
-- (tipo, puntos por game, win-by, best-of). Por ahora solo se llena para
-- pickleball desde el create flow; otros deportes pueden adoptarlo después.
--
-- scoring_config jsonb shape:
--   { "type": "side_out"|"rally", "points": int, "winBy": int, "bestOf": int }
-- Default = formato más popular: dobles, side-out, best of 3 a 11, gana por 2.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mp_tournament_modality') then
    create type mp_tournament_modality as enum ('singles', 'doubles', 'mixed_doubles');
  end if;
end$$;

alter table public.tournaments
  add column if not exists modality mp_tournament_modality not null default 'doubles',
  add column if not exists scoring_config jsonb not null default
    '{"type":"side_out","points":11,"winBy":2,"bestOf":3}'::jsonb;

-- Backfill: filas existentes ya quedan con los defaults; nada más que hacer.
-- Comentarios de tabla para autodocumentación.
comment on column public.tournaments.modality is
  'Categoría del torneo: singles (1v1), doubles (2v2), mixed_doubles (1H+1M v 1H+1M)';
comment on column public.tournaments.scoring_config is
  'Sistema de puntuación. type: side_out (solo el sacador puntúa) o rally (cualquiera). points: meta de game (11/15/21). winBy: diferencia mínima. bestOf: cantidad de games del match (1/3/5).';
