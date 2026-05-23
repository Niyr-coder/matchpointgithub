-- 170 · reservations.for_user_id: vincula una reserva al cliente real
-- (separado de organizer_id que es quien la CREA — owner/staff cuando es
-- reserva manual, o el mismo player cuando se reserva desde la app).
--
-- Nullable: walk-ins sin cuenta MATCHPOINT siguen guardando el nombre en
-- `notes` y for_user_id = NULL.
--
-- Permite que el cliente vea la reserva en su pantalla "Mis reservas"
-- aunque no fue él quien la insertó.

alter table reservations
  add column if not exists for_user_id uuid references profiles(id) on delete set null;

-- Index para "Mis reservas" de un user (filtro por for_user_id).
create index if not exists idx_reservations_for_user
  on reservations (for_user_id, during desc)
  where for_user_id is not null;
