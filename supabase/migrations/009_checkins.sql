-- 009 · Check-ins. See 20-database.md §6.
-- class_session_id FK added in 013_classes.sql via deferred alter.

create table check_ins (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references reservations(id),
  class_session_id uuid,
  user_id uuid references profiles(id),
  club_id uuid not null references clubs(id),
  method text not null check (method in ('qr','manual','auto')),
  scanned_by uuid references profiles(id),
  scanned_at timestamptz default now() not null,
  check ((reservation_id is not null) or (class_session_id is not null))
);

create index idx_check_ins_club_time on check_ins (club_id, scanned_at desc);

alter table check_ins enable row level security;

create policy ci_select on check_ins for select using (
  user_id = auth.uid()
  or mp_club_staff(club_id)
  or mp_is_employee_of(club_id)
);

create policy ci_staff_write on check_ins for all using (
  mp_club_staff(club_id) or mp_is_employee_of(club_id)
);
