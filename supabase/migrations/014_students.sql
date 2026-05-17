-- 014 · Student progress + evaluations + notes.
-- See 20-database.md §11 and 30-rls.md §4.8.

create table student_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid not null references coach_profiles(id),
  skill text not null,
  current_level int not null check (current_level between 1 and 10),
  target_level int check (target_level between 1 and 10),
  updated_at timestamptz default now() not null,
  unique (student_id, coach_id, skill)
);
create trigger tg_student_progress_updated before update on student_progress
  for each row execute function tg_set_updated_at();

create table student_evaluations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid not null references coach_profiles(id),
  class_session_id uuid references class_sessions(id),
  scores jsonb not null,
  summary text,
  created_at timestamptz default now() not null
);

create table student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id),
  coach_id uuid not null references coach_profiles(id),
  body text not null,
  visibility text not null default 'coach' check (visibility in ('coach','shared')),
  created_at timestamptz default now() not null
);

alter table student_progress enable row level security;
create policy sp_student_self on student_progress for select using (student_id = auth.uid());
create policy sp_coach_write on student_progress for all
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

alter table student_evaluations enable row level security;
create policy se_student_self on student_evaluations for select using (student_id = auth.uid());
create policy se_coach_write on student_evaluations for all using (coach_id = auth.uid());

alter table student_notes enable row level security;
create policy sn_coach_all on student_notes for all using (coach_id = auth.uid());
create policy sn_student_shared on student_notes for select
  using (student_id = auth.uid() and visibility = 'shared');
