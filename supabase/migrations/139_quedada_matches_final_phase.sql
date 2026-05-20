-- 139: Fase final de medallas (eliminación directa) en el motor de quedadas.
--
-- Round robin (estándar pickleball): grupos -> tabla -> fase final por las
-- medallas. Esta migración agrega a quedada_matches lo necesario para el cuadro
-- de eliminación, sin tabla nueva (reusa round_no como ronda del cuadro).
--
-- phase: 'groups' (round robin por grupo, default) | 'final' (eliminación).
-- bracket_pos: posición del partido dentro de su ronda del cuadro (0-indexed).
--   El ganador de (round_no=r, bracket_pos=p) avanza a (r+1, floor(p/2)); va al
--   lado A si p es par, al lado B si es impar.
-- is_bronze: partido por el 3er puesto (lo juegan los perdedores de semifinales).
alter table public.quedada_matches
  add column if not exists phase text not null default 'groups',
  add column if not exists bracket_pos int,
  add column if not exists is_bronze boolean not null default false;

alter table public.quedada_matches
  drop constraint if exists quedada_matches_phase_check;
alter table public.quedada_matches
  add constraint quedada_matches_phase_check check (phase in ('groups', 'final'));
