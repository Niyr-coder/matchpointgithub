-- 099 · Apply tg_audit to business-critical tables.
-- See 20-database.md §0 and §21.
-- Idempotent: drops before recreate. Excludes:
--   - audit_log itself (loops)
--   - high-volume / no-business tables: sessions, message_reads, resource_views,
--     ranking_snapshots, inventory_movements (handled via cash audit)

do $$
declare
  t text;
  candidates text[] := array[
    'profiles','role_assignments','role_requests',
    'clubs','club_settings','club_amenities','club_photos',
    'club_applications','club_application_courts','club_application_documents',
    'club_application_photos','club_application_events',
    'courts','court_pricing','court_blocks',
    'reservations','reservation_participants','reservation_payments','walkins',
    'check_ins',
    'cash_sessions','transactions','refunds','cash_movements',
    'product_categories','products','carts','cart_items','sales','sale_items',
    'coach_profiles','coach_clubs','coach_specialties','coach_availability',
    'coach_certifications','coach_reviews',
    'classes','class_sessions','class_enrollments','class_session_attendance','lessons_1on1',
    'student_progress','student_evaluations','student_notes',
    'resources','resource_files','resource_access',
    'conversations','conversation_members','messages','message_attachments',
    'friend_requests','friendships','blocks',
    'teams','team_members','team_invites',
    'match_results',
    'leagues','tournaments','tournament_categories','registrations',
    'brackets','bracket_matches',
    'events','event_registrations','event_check_ins',
    'notifications','notification_kinds','notification_preferences','notification_templates',
    'broadcasts','broadcast_recipients',
    'reports','moderation_actions',
    'tickets','ticket_messages',
    'feature_flags','feature_flag_assignments',
    'partner_orgs','partner_members','partner_club_links'
  ];
begin
  foreach t in array candidates loop
    execute format('drop trigger if exists tg_audit_%I on %I;', t, t);
    execute format(
      'create trigger tg_audit_%I after insert or update or delete on %I
        for each row execute function tg_audit();',
      t, t
    );
  end loop;
end $$;
