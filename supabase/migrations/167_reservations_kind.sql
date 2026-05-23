-- 167 · reservations.kind: distingue reservas regulares de eventos / clases
-- en el grid operativo del club. Hasta ahora `reservations` solo modelaba
-- bookings de jugador; los slots de "Evento" y "Clase" del calendario del
-- owner no se podían materializar.
--
-- Default 'booking' para no romper inserts existentes. Las pantallas que
-- escriben reservas (booking flow del user) siguen sin pasar kind →
-- queda en 'booking'. Slots de tipo 'event' los crea el flujo de torneos
-- al reservar canchas (futuro). 'class' los crea el flujo de coach
-- (futuro). Hoy admin/owner los puede crear via "Reserva manual" en
-- ClubReservasScreen.

alter table reservations
  add column if not exists kind text not null default 'booking'
    check (kind in ('booking', 'event', 'class'));

create index if not exists idx_reservations_kind on reservations (club_id, kind)
  where status not in ('cancelled');
