-- Fix FK constraints that blocked user account deletion.
--
-- auth.users refs without ON DELETE caused GoTrue to fail immediately.
-- profiles refs without ON DELETE blocked the cascade.
-- Both sets get ON DELETE SET NULL so that deleting a user account
-- nullifies reviewer/actor/created_by columns in historical records
-- instead of preventing the deletion entirely.
--
-- NOT NULL FK refs (organizer_id, student_id, opened_by, etc.) are
-- intentionally skipped: those rows represent content the user created
-- and cannot be anonymised without understanding business rules. If a
-- user has such records, deleteUser will still fail and the caller
-- should fall back to suspension.

-- ── auth.users reference ────────────────────────────────────────────────
alter table transactions drop constraint if exists transactions_proof_reviewed_by_fkey;
alter table transactions add constraint transactions_proof_reviewed_by_fkey
  foreign key (proof_reviewed_by) references auth.users(id) on delete set null;

-- ── profiles references ─────────────────────────────────────────────────

-- clubs
alter table clubs drop constraint if exists clubs_applied_by_fkey;
alter table clubs add constraint clubs_applied_by_fkey
  foreign key (applied_by) references profiles(id) on delete set null;

alter table clubs drop constraint if exists clubs_approved_by_fkey;
alter table clubs add constraint clubs_approved_by_fkey
  foreign key (approved_by) references profiles(id) on delete set null;

-- role_assignments
alter table role_assignments drop constraint if exists role_assignments_granted_by_fkey;
alter table role_assignments add constraint role_assignments_granted_by_fkey
  foreign key (granted_by) references profiles(id) on delete set null;

-- role_requests
alter table role_requests drop constraint if exists role_requests_reviewed_by_fkey;
alter table role_requests add constraint role_requests_reviewed_by_fkey
  foreign key (reviewed_by) references profiles(id) on delete set null;

-- club_applications
alter table club_applications drop constraint if exists club_applications_location_verified_by_fkey;
alter table club_applications add constraint club_applications_location_verified_by_fkey
  foreign key (location_verified_by) references profiles(id) on delete set null;

alter table club_applications drop constraint if exists club_applications_reviewer_id_fkey;
alter table club_applications add constraint club_applications_reviewer_id_fkey
  foreign key (reviewer_id) references profiles(id) on delete set null;

-- club_application_documents
alter table club_application_documents drop constraint if exists club_application_documents_reviewed_by_fkey;
alter table club_application_documents add constraint club_application_documents_reviewed_by_fkey
  foreign key (reviewed_by) references profiles(id) on delete set null;

-- club_application_events
alter table club_application_events drop constraint if exists club_application_events_actor_id_fkey;
alter table club_application_events add constraint club_application_events_actor_id_fkey
  foreign key (actor_id) references profiles(id) on delete set null;

-- court_blocks
alter table court_blocks drop constraint if exists court_blocks_created_by_fkey;
alter table court_blocks add constraint court_blocks_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- audit_log
alter table audit_log drop constraint if exists audit_log_actor_id_fkey;
alter table audit_log add constraint audit_log_actor_id_fkey
  foreign key (actor_id) references profiles(id) on delete set null;

-- reservation_participants (invited_by only; user_id is NOT NULL + already CASCADE)
alter table reservation_participants drop constraint if exists reservation_participants_invited_by_fkey;
alter table reservation_participants add constraint reservation_participants_invited_by_fkey
  foreign key (invited_by) references profiles(id) on delete set null;

-- reservation_payments
alter table reservation_payments drop constraint if exists reservation_payments_user_id_fkey;
alter table reservation_payments add constraint reservation_payments_user_id_fkey
  foreign key (user_id) references profiles(id) on delete set null;

-- walkins
alter table walkins drop constraint if exists walkins_attended_by_fkey;
alter table walkins add constraint walkins_attended_by_fkey
  foreign key (attended_by) references profiles(id) on delete set null;

-- check_ins
alter table check_ins drop constraint if exists check_ins_user_id_fkey;
alter table check_ins add constraint check_ins_user_id_fkey
  foreign key (user_id) references profiles(id) on delete set null;

alter table check_ins drop constraint if exists check_ins_scanned_by_fkey;
alter table check_ins add constraint check_ins_scanned_by_fkey
  foreign key (scanned_by) references profiles(id) on delete set null;

-- cash_sessions
alter table cash_sessions drop constraint if exists cash_sessions_closed_by_fkey;
alter table cash_sessions add constraint cash_sessions_closed_by_fkey
  foreign key (closed_by) references profiles(id) on delete set null;

-- transactions
alter table transactions drop constraint if exists transactions_customer_user_id_fkey;
alter table transactions add constraint transactions_customer_user_id_fkey
  foreign key (customer_user_id) references profiles(id) on delete set null;

alter table transactions drop constraint if exists transactions_created_by_fkey;
alter table transactions add constraint transactions_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table transactions drop constraint if exists transactions_refunded_by_fkey;
alter table transactions add constraint transactions_refunded_by_fkey
  foreign key (refunded_by) references profiles(id) on delete set null;

-- sales
alter table sales drop constraint if exists sales_customer_user_id_fkey;
alter table sales add constraint sales_customer_user_id_fkey
  foreign key (customer_user_id) references profiles(id) on delete set null;

alter table sales drop constraint if exists sales_sold_by_fkey;
alter table sales add constraint sales_sold_by_fkey
  foreign key (sold_by) references profiles(id) on delete set null;

-- coach_profiles
alter table coach_profiles drop constraint if exists coach_profiles_verified_by_fkey;
alter table coach_profiles add constraint coach_profiles_verified_by_fkey
  foreign key (verified_by) references profiles(id) on delete set null;

-- resource_access
alter table resource_access drop constraint if exists resource_access_user_id_fkey;
alter table resource_access add constraint resource_access_user_id_fkey
  foreign key (user_id) references profiles(id) on delete set null;

-- match_results
alter table match_results drop constraint if exists match_results_confirmed_by_fkey;
alter table match_results add constraint match_results_confirmed_by_fkey
  foreign key (confirmed_by) references profiles(id) on delete set null;

-- brackets
alter table brackets drop constraint if exists brackets_generated_by_fkey;
alter table brackets add constraint brackets_generated_by_fkey
  foreign key (generated_by) references profiles(id) on delete set null;

-- event_check_ins
alter table event_check_ins drop constraint if exists event_check_ins_checked_in_by_fkey;
alter table event_check_ins add constraint event_check_ins_checked_in_by_fkey
  foreign key (checked_in_by) references profiles(id) on delete set null;

-- reports
alter table reports drop constraint if exists reports_reviewed_by_fkey;
alter table reports add constraint reports_reviewed_by_fkey
  foreign key (reviewed_by) references profiles(id) on delete set null;

-- moderation_actions
alter table moderation_actions drop constraint if exists moderation_actions_target_user_id_fkey;
alter table moderation_actions add constraint moderation_actions_target_user_id_fkey
  foreign key (target_user_id) references profiles(id) on delete set null;

-- tickets
alter table tickets drop constraint if exists tickets_assignee_id_fkey;
alter table tickets add constraint tickets_assignee_id_fkey
  foreign key (assignee_id) references profiles(id) on delete set null;

-- payouts
alter table payouts drop constraint if exists payouts_coach_id_fkey;
alter table payouts add constraint payouts_coach_id_fkey
  foreign key (coach_id) references profiles(id) on delete set null;

alter table payouts drop constraint if exists payouts_created_by_fkey;
alter table payouts add constraint payouts_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- shifts
alter table shifts drop constraint if exists shifts_created_by_fkey;
alter table shifts add constraint shifts_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- announcements
alter table announcements drop constraint if exists announcements_created_by_fkey;
alter table announcements add constraint announcements_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- broadcast_templates
alter table broadcast_templates drop constraint if exists broadcast_templates_created_by_fkey;
alter table broadcast_templates add constraint broadcast_templates_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- team_achievements
alter table team_achievements drop constraint if exists team_achievements_awarded_by_fkey;
alter table team_achievements add constraint team_achievements_awarded_by_fkey
  foreign key (awarded_by) references profiles(id) on delete set null;

-- team_reports
alter table team_reports drop constraint if exists team_reports_resolved_by_fkey;
alter table team_reports add constraint team_reports_resolved_by_fkey
  foreign key (resolved_by) references profiles(id) on delete set null;

-- court_maintenance_log
alter table court_maintenance_log drop constraint if exists court_maintenance_log_started_by_fkey;
alter table court_maintenance_log add constraint court_maintenance_log_started_by_fkey
  foreign key (started_by) references profiles(id) on delete set null;

alter table court_maintenance_log drop constraint if exists court_maintenance_log_ended_by_fkey;
alter table court_maintenance_log add constraint court_maintenance_log_ended_by_fkey
  foreign key (ended_by) references profiles(id) on delete set null;
