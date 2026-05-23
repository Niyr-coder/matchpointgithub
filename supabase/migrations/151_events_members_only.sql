-- 151 · Eventos solo para miembros VIP del club (acceso de membresía).
-- Si members_only=true y el evento tiene club_id, solo se pueden inscribir los
-- usuarios con membresía activa de ese club (gate en registerForEvent).
alter table public.events
  add column if not exists members_only boolean not null default false;
