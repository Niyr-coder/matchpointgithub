-- 013 · Classes + sessions + enrollments + lessons_1on1.
-- See 20-database.md §10 and 30-rls.md §4.7.

create table classes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  coach_id uuid not null references coach_profiles(id),
  name text not null,
  description text,
  kind mp_class_kind not null,
  sport mp_sport not null,
  skill_level mp_skill_level,
  max_students int not null default 8,
  price_cents int not null,
  currency mp_currency not null,
  recurrence_rule text,
  active boolean not null default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
create index idx_classes_club on classes (club_id);
create trigger tg_classes_updated before update on classes
  for each row execute function tg_set_updated_at();

create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  court_id uuid references courts(id),
  during tstzrange not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','completed','cancelled')),
  notes text,
  created_at timestamptz default now() not null,
  exclude using gist (court_id with =, during with &&)
    where (court_id is not null and status != 'cancelled')
);
create index idx_class_sessions_class_time on class_sessions (class_id, during);

-- backfill FK on check_ins
alter table check_ins
  add constraint check_ins_class_session_fk
  foreign key (class_session_id) references class_sessions(id);

create table class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references profiles(id),
  status text not null default 'enrolled' check (status in ('enrolled','waitlist','cancelled','completed')),
  enrolled_at timestamptz default now() not null,
  paid_transaction_id uuid references transactions(id),
  unique (class_id, student_id)
);

create table class_session_attendance (
  class_session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references profiles(id),
  attended boolean,
  arrived_at timestamptz,
  primary key (class_session_id, student_id)
);

create table lessons_1on1 (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id),
  court_id uuid references courts(id),
  coach_id uuid not null references coach_profiles(id),
  student_id uuid not null references profiles(id),
  during tstzrange not null,
  price_cents int not null,
  currency mp_currency not null,
  status mp_reservation_status not null default 'booked',
  paid_transaction_id uuid references transactions(id),
  notes text,
  created_at timestamptz default now() not null,
  exclude using gist (coach_id with =, during with &&) where (status not in ('cancelled')),
  exclude using gist (court_id with =, during with &&) where (court_id is not null and status not in ('cancelled'))
);

-- RLS
alter table classes enable row level security;
create policy classes_public_select on classes for select using (active);
create policy classes_coach_write on classes for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy classes_staff_write on classes for all
  using (mp_club_staff(club_id)) with check (mp_club_staff(club_id));

alter table class_sessions enable row level security;
create policy csess_public_select on class_sessions for select using (true);
create policy csess_coach_write on class_sessions for all using (
  exists(select 1 from classes c where c.id = class_id and c.coach_id = auth.uid())
);
create policy csess_staff_write on class_sessions for all using (
  exists(select 1 from classes c where c.id = class_id and mp_club_staff(c.club_id))
);

alter table class_enrollments enable row level security;
create policy ce_student_self on class_enrollments for select using (student_id = auth.uid());
create policy ce_student_enroll on class_enrollments for insert with check (student_id = auth.uid());
create policy ce_student_cancel on class_enrollments for update
  using (student_id = auth.uid() and status in ('enrolled','waitlist'));
create policy ce_coach_select on class_enrollments for select using (
  exists(select 1 from classes c where c.id = class_id and c.coach_id = auth.uid())
);
create policy ce_staff on class_enrollments for all using (
  exists(select 1 from classes c where c.id = class_id and mp_club_staff(c.club_id))
);

alter table class_session_attendance enable row level security;
create policy csa_student_select on class_session_attendance for select using (student_id = auth.uid());
create policy csa_coach_all on class_session_attendance for all using (
  exists(select 1 from class_sessions s join classes c on c.id = s.class_id
         where s.id = class_session_id and c.coach_id = auth.uid())
);

alter table lessons_1on1 enable row level security;
create policy l1_visible on lessons_1on1 for select using (
  coach_id = auth.uid() or student_id = auth.uid() or mp_club_staff(club_id)
);
create policy l1_student_book on lessons_1on1 for insert with check (student_id = auth.uid());
create policy l1_participant_update on lessons_1on1 for update
  using (coach_id = auth.uid() or student_id = auth.uid());
