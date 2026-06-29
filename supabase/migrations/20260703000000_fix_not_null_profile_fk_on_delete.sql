-- Fix NOT NULL FK columns referencing profiles(id) that blocked user deletion.
--
-- The previous migration (20260628120000) fixed nullable FK columns.
-- These are the NOT NULL ones that still prevented auth.admin.deleteUser
-- from working on any active user (e.g. anyone who sent a message, played
-- a match, or created a tournament).
--
-- Strategy:
--  · Records owned by the user (enrollment, attendance, etc.) → CASCADE
--  · Actor/auditor/creator columns → drop NOT NULL + ON DELETE SET NULL
--    so historical records survive with a null reference.

BEGIN;

-- ── reservations ───────────────────────────────────────────────────────────
alter table reservations
  drop constraint if exists reservations_organizer_id_fkey;
alter table reservations
  alter column organizer_id drop not null;
alter table reservations
  add constraint reservations_organizer_id_fkey
  foreign key (organizer_id) references profiles(id) on delete set null;

-- ── cash_sessions ──────────────────────────────────────────────────────────
alter table cash_sessions
  drop constraint if exists cash_sessions_opened_by_fkey;
alter table cash_sessions
  alter column opened_by drop not null;
alter table cash_sessions
  add constraint cash_sessions_opened_by_fkey
  foreign key (opened_by) references profiles(id) on delete set null;

-- ── refunds ────────────────────────────────────────────────────────────────
alter table refunds
  drop constraint if exists refunds_created_by_fkey;
alter table refunds
  alter column created_by drop not null;
alter table refunds
  add constraint refunds_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- ── cash_movements ─────────────────────────────────────────────────────────
alter table cash_movements
  drop constraint if exists cash_movements_created_by_fkey;
alter table cash_movements
  alter column created_by drop not null;
alter table cash_movements
  add constraint cash_movements_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- ── inventory_movements ────────────────────────────────────────────────────
alter table inventory_movements
  drop constraint if exists inventory_movements_created_by_fkey;
alter table inventory_movements
  alter column created_by drop not null;
alter table inventory_movements
  add constraint inventory_movements_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- ── coach_reviews ──────────────────────────────────────────────────────────
alter table coach_reviews
  drop constraint if exists coach_reviews_reviewer_id_fkey;
alter table coach_reviews
  alter column reviewer_id drop not null;
alter table coach_reviews
  add constraint coach_reviews_reviewer_id_fkey
  foreign key (reviewer_id) references profiles(id) on delete set null;

-- ── class_enrollments (owned by student → CASCADE) ────────────────────────
alter table class_enrollments
  drop constraint if exists class_enrollments_student_id_fkey;
alter table class_enrollments
  add constraint class_enrollments_student_id_fkey
  foreign key (student_id) references profiles(id) on delete cascade;

-- ── class_session_attendance (owned by student → CASCADE) ─────────────────
alter table class_session_attendance
  drop constraint if exists class_session_attendance_student_id_fkey;
alter table class_session_attendance
  add constraint class_session_attendance_student_id_fkey
  foreign key (student_id) references profiles(id) on delete cascade;

-- ── lessons_1on1 (owned by student → CASCADE) ─────────────────────────────
alter table lessons_1on1
  drop constraint if exists lessons_1on1_student_id_fkey;
alter table lessons_1on1
  add constraint lessons_1on1_student_id_fkey
  foreign key (student_id) references profiles(id) on delete cascade;

-- ── student_notes (owned by student → CASCADE) ────────────────────────────
alter table student_notes
  drop constraint if exists student_notes_student_id_fkey;
alter table student_notes
  add constraint student_notes_student_id_fkey
  foreign key (student_id) references profiles(id) on delete cascade;

-- ── resource_access ────────────────────────────────────────────────────────
alter table resource_access
  drop constraint if exists resource_access_granted_by_fkey;
alter table resource_access
  alter column granted_by drop not null;
alter table resource_access
  add constraint resource_access_granted_by_fkey
  foreign key (granted_by) references profiles(id) on delete set null;

-- ── resource_views (owned by user → CASCADE) ──────────────────────────────
alter table resource_views
  drop constraint if exists resource_views_user_id_fkey;
alter table resource_views
  add constraint resource_views_user_id_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

-- ── conversations ──────────────────────────────────────────────────────────
alter table conversations
  drop constraint if exists conversations_created_by_fkey;
alter table conversations
  alter column created_by drop not null;
alter table conversations
  add constraint conversations_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- ── messages ───────────────────────────────────────────────────────────────
alter table messages
  drop constraint if exists messages_sender_id_fkey;
alter table messages
  alter column sender_id drop not null;
alter table messages
  add constraint messages_sender_id_fkey
  foreign key (sender_id) references profiles(id) on delete set null;

-- ── teams ──────────────────────────────────────────────────────────────────
alter table teams
  drop constraint if exists teams_captain_id_fkey;
alter table teams
  alter column captain_id drop not null;
alter table teams
  add constraint teams_captain_id_fkey
  foreign key (captain_id) references profiles(id) on delete set null;

-- ── team_invites ───────────────────────────────────────────────────────────
alter table team_invites
  drop constraint if exists team_invites_invited_by_fkey;
alter table team_invites
  alter column invited_by drop not null;
alter table team_invites
  add constraint team_invites_invited_by_fkey
  foreign key (invited_by) references profiles(id) on delete set null;

-- ── match_results ──────────────────────────────────────────────────────────
alter table match_results
  drop constraint if exists match_results_reported_by_fkey;
alter table match_results
  alter column reported_by drop not null;
alter table match_results
  add constraint match_results_reported_by_fkey
  foreign key (reported_by) references profiles(id) on delete set null;

-- ── leagues ────────────────────────────────────────────────────────────────
alter table leagues
  drop constraint if exists leagues_created_by_fkey;
alter table leagues
  alter column created_by drop not null;
alter table leagues
  add constraint leagues_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- ── tournaments ────────────────────────────────────────────────────────────
alter table tournaments
  drop constraint if exists tournaments_created_by_fkey;
alter table tournaments
  alter column created_by drop not null;
alter table tournaments
  add constraint tournaments_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- ── registrations ──────────────────────────────────────────────────────────
alter table registrations
  drop constraint if exists registrations_registered_by_fkey;
alter table registrations
  alter column registered_by drop not null;
alter table registrations
  add constraint registrations_registered_by_fkey
  foreign key (registered_by) references profiles(id) on delete set null;

-- ── events ─────────────────────────────────────────────────────────────────
alter table events
  drop constraint if exists events_organizer_id_fkey;
alter table events
  alter column organizer_id drop not null;
alter table events
  add constraint events_organizer_id_fkey
  foreign key (organizer_id) references profiles(id) on delete set null;

-- ── broadcasts ─────────────────────────────────────────────────────────────
alter table broadcasts
  drop constraint if exists broadcasts_created_by_fkey;
alter table broadcasts
  alter column created_by drop not null;
alter table broadcasts
  add constraint broadcasts_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- ── reports ────────────────────────────────────────────────────────────────
alter table reports
  drop constraint if exists reports_reporter_id_fkey;
alter table reports
  alter column reporter_id drop not null;
alter table reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references profiles(id) on delete set null;

-- ── moderation_actions ─────────────────────────────────────────────────────
alter table moderation_actions
  drop constraint if exists moderation_actions_performed_by_fkey;
alter table moderation_actions
  alter column performed_by drop not null;
alter table moderation_actions
  add constraint moderation_actions_performed_by_fkey
  foreign key (performed_by) references profiles(id) on delete set null;

-- ── tickets ────────────────────────────────────────────────────────────────
alter table tickets
  drop constraint if exists tickets_opener_id_fkey;
alter table tickets
  alter column opener_id drop not null;
alter table tickets
  add constraint tickets_opener_id_fkey
  foreign key (opener_id) references profiles(id) on delete set null;

-- ── ticket_messages ────────────────────────────────────────────────────────
alter table ticket_messages
  drop constraint if exists ticket_messages_author_id_fkey;
alter table ticket_messages
  alter column author_id drop not null;
alter table ticket_messages
  add constraint ticket_messages_author_id_fkey
  foreign key (author_id) references profiles(id) on delete set null;

-- ── shifts ─────────────────────────────────────────────────────────────────
alter table shifts
  drop constraint if exists shifts_user_id_fkey;
alter table shifts
  alter column user_id drop not null;
alter table shifts
  add constraint shifts_user_id_fkey
  foreign key (user_id) references profiles(id) on delete set null;

-- ── matches (ON DELETE RESTRICT → SET NULL) ────────────────────────────────
-- This was explicitly RESTRICT which blocked deletion of any user with matches.
alter table matches
  drop constraint if exists matches_created_by_fkey;
alter table matches
  alter column created_by drop not null;
alter table matches
  add constraint matches_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

COMMIT;
