-- ends_at deja de ser obligatorio. Casos: torneos de un solo día donde solo
-- importa la hora de inicio. La UI muestra el rango si está, o solo el inicio.
alter table public.tournaments alter column ends_at drop not null;
comment on column public.tournaments.ends_at is
  'Fin del torneo. Opcional: NULL implica torneo de un solo día (usa starts_at como referencia única).';
