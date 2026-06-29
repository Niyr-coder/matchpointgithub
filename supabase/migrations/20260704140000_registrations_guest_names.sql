-- Añade guest_names para inscritos walk-in (sin cuenta MatchPoint).
-- player_ids queda vacío (ARRAY[]::uuid[]) cuando todos son walk-ins.
-- Para dobles con 1 registrado + 1 walk-in: player_ids tiene el UUID, guest_names tiene el nombre del walk-in.
alter table public.registrations
  add column if not exists guest_names text[] null;

comment on column public.registrations.guest_names is
  'Nombres de jugadores walk-in (sin cuenta MatchPoint). Null cuando todos los jugadores están en player_ids.';
