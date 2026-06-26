-- Pantalla TV (link secreto) + partido por el 3er puesto en eliminatoria.

alter table public.tournaments
  add column if not exists display_token uuid unique;

comment on column public.tournaments.display_token is
  'Token opcional para /t/{slug}/live?k= — pantalla venue sin login. Rotable desde partner.';

create index if not exists idx_tournaments_display_token
  on public.tournaments (display_token)
  where display_token is not null;

alter table public.bracket_matches
  add column if not exists is_bronze boolean not null default false;

comment on column public.bracket_matches.is_bronze is
  'Partido por el 3er puesto (perdedores de semifinales). round=0, fuera del cuadro principal.';
