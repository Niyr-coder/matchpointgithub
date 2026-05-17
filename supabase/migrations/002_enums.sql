-- 002 · Shared enums (referenced across many domains).
-- See docs/architecture/20-database.md §1.

create type mp_sport as enum ('tennis','padel','pickleball');

create type mp_skill_level as enum ('beginner','intermediate','advanced','pro');

create type mp_role as enum ('admin','partner','user','owner','manager','coach','employee');

create type mp_currency as enum ('USD','MXN','CLP','ARS','BRL','EUR');

create type mp_payment_method as enum ('cash','card','transfer','wallet','free');

create type mp_payment_status as enum
  ('pending','authorized','captured','refunded','failed','disputed');

create type mp_reservation_status as enum
  ('booked','confirmed','checked_in','no_show','cancelled','completed');

create type mp_class_kind as enum
  ('group','clinic','camp','one_on_one','semi_private');

create type mp_visibility as enum ('public','members','private');

create type mp_event_status as enum
  ('draft','published','registration_open','registration_closed','live','finished','cancelled');

create type mp_tournament_format as enum
  ('single_elim','double_elim','round_robin','swiss','groups_to_knockout');

create type mp_match_status as enum
  ('scheduled','live','reported','confirmed','disputed','walkover','cancelled');

create type mp_ticket_status as enum
  ('open','in_progress','waiting_user','resolved','closed');

create type mp_ticket_severity as enum ('low','medium','high','critical');

create type mp_report_status as enum
  ('pending','reviewing','actioned','dismissed');

create type mp_notification_channel as enum ('inapp','email','push','sms');

-- Club application enums
create type mp_club_app_status as enum (
  'draft',
  'submitted',
  'docs_review',
  'field_verification',
  'final_review',
  'approved',
  'rejected',
  'withdrawn'
);

create type mp_club_org_type as enum ('private','public','concession');
create type mp_parking_type as enum ('unknown','street','private','valet');
create type mp_cancellation_policy as enum ('flexible_24h','moderate_48h','strict_7d');
create type mp_club_doc_kind as enum (
  'tax_id_certificate',
  'incorporation_act',
  'land_use_permit',
  'liability_insurance',
  'health_permit',
  'other'
);
create type mp_club_doc_status as enum ('pending','uploaded','approved','rejected');
create type mp_club_app_event_kind as enum (
  'created','step_completed','submitted',
  'docs_review_started','docs_approved','docs_rejected',
  'field_scheduled','field_completed',
  'final_review_started','approved','rejected','withdrawn',
  'note_added','contacted'
);
