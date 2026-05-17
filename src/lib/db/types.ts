export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          club_id: string | null
          created_at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: number
          ip: unknown
          ua: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          club_id?: string | null
          created_at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: number
          ip?: unknown
          ua?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          club_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: number
          ip?: unknown
          ua?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bracket_matches: {
        Row: {
          bracket_id: string
          court_id: string | null
          id: string
          match_result_id: string | null
          position: number
          round: number
          scheduled_at: string | null
          score: Json | null
          side_a_registration_id: string | null
          side_b_registration_id: string | null
          status: Database["public"]["Enums"]["mp_match_status"]
          winner_side: string | null
        }
        Insert: {
          bracket_id: string
          court_id?: string | null
          id?: string
          match_result_id?: string | null
          position: number
          round: number
          scheduled_at?: string | null
          score?: Json | null
          side_a_registration_id?: string | null
          side_b_registration_id?: string | null
          status?: Database["public"]["Enums"]["mp_match_status"]
          winner_side?: string | null
        }
        Update: {
          bracket_id?: string
          court_id?: string | null
          id?: string
          match_result_id?: string | null
          position?: number
          round?: number
          scheduled_at?: string | null
          score?: Json | null
          side_a_registration_id?: string | null
          side_b_registration_id?: string | null
          status?: Database["public"]["Enums"]["mp_match_status"]
          winner_side?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bracket_matches_bracket_id_fkey"
            columns: ["bracket_id"]
            isOneToOne: false
            referencedRelation: "brackets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_match_result_id_fkey"
            columns: ["match_result_id"]
            isOneToOne: false
            referencedRelation: "match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_side_a_registration_id_fkey"
            columns: ["side_a_registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bracket_matches_side_b_registration_id_fkey"
            columns: ["side_b_registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      brackets: {
        Row: {
          category_id: string | null
          format: Database["public"]["Enums"]["mp_tournament_format"]
          generated_at: string
          generated_by: string | null
          id: string
          size: number
          tournament_id: string
        }
        Insert: {
          category_id?: string | null
          format: Database["public"]["Enums"]["mp_tournament_format"]
          generated_at?: string
          generated_by?: string | null
          id?: string
          size: number
          tournament_id: string
        }
        Update: {
          category_id?: string | null
          format?: Database["public"]["Enums"]["mp_tournament_format"]
          generated_at?: string
          generated_by?: string | null
          id?: string
          size?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brackets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tournament_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brackets_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brackets_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brackets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brackets_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments_public_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_recipients: {
        Row: {
          broadcast_id: string
          notification_id: string | null
          user_id: string
        }
        Insert: {
          broadcast_id: string
          notification_id?: string | null
          user_id: string
        }
        Update: {
          broadcast_id?: string
          notification_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          body: string
          channels: Database["public"]["Enums"]["mp_notification_channel"][]
          club_id: string | null
          created_at: string
          created_by: string
          id: string
          partner_id: string | null
          payload: Json | null
          scheduled_for: string | null
          scope: string
          sent_at: string | null
          status: string
          target_filter: Json
          title: string
        }
        Insert: {
          body: string
          channels?: Database["public"]["Enums"]["mp_notification_channel"][]
          club_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          partner_id?: string | null
          payload?: Json | null
          scheduled_for?: string | null
          scope: string
          sent_at?: string | null
          status?: string
          target_filter?: Json
          title: string
        }
        Update: {
          body?: string
          channels?: Database["public"]["Enums"]["mp_notification_channel"][]
          club_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          partner_id?: string | null
          payload?: Json | null
          scheduled_for?: string | null
          scope?: string
          sent_at?: string | null
          status?: string
          target_filter?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_partner_fk"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          product_id: string
          qty: number
          unit_price_cents: number
        }
        Insert: {
          cart_id: string
          product_id: string
          qty: number
          unit_price_cents: number
        }
        Update: {
          cart_id?: string
          product_id?: string
          qty?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          club_id: string | null
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount_cents: number
          cash_session_id: string
          created_at: string
          created_by: string
          id: string
          kind: string
          reason: string | null
        }
        Insert: {
          amount_cents: number
          cash_session_id: string
          created_at?: string
          created_by: string
          id?: string
          kind: string
          reason?: string | null
        }
        Update: {
          amount_cents?: number
          cash_session_id?: string
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_counted_cents: number | null
          club_id: string
          expected_cents: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_float_cents: number
          status: string
          variance_cents: number | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_counted_cents?: number | null
          club_id: string
          expected_cents?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_float_cents?: number
          status?: string
          variance_cents?: number | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_counted_cents?: number | null
          club_id?: string
          expected_cents?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_float_cents?: number
          status?: string
          variance_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          class_session_id: string | null
          club_id: string
          id: string
          method: string
          reservation_id: string | null
          scanned_at: string
          scanned_by: string | null
          user_id: string | null
        }
        Insert: {
          class_session_id?: string | null
          club_id: string
          id?: string
          method: string
          reservation_id?: string | null
          scanned_at?: string
          scanned_by?: string | null
          user_id?: string | null
        }
        Update: {
          class_session_id?: string | null
          club_id?: string
          id?: string
          method?: string
          reservation_id?: string | null
          scanned_at?: string
          scanned_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_class_session_fk"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_scanned_by_fkey"
            columns: ["scanned_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_enrollments: {
        Row: {
          class_id: string
          enrolled_at: string
          id: string
          paid_transaction_id: string | null
          status: string
          student_id: string
        }
        Insert: {
          class_id: string
          enrolled_at?: string
          id?: string
          paid_transaction_id?: string | null
          status?: string
          student_id: string
        }
        Update: {
          class_id?: string
          enrolled_at?: string
          id?: string
          paid_transaction_id?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_paid_transaction_id_fkey"
            columns: ["paid_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_session_attendance: {
        Row: {
          arrived_at: string | null
          attended: boolean | null
          class_session_id: string
          student_id: string
        }
        Insert: {
          arrived_at?: string | null
          attended?: boolean | null
          class_session_id: string
          student_id: string
        }
        Update: {
          arrived_at?: string | null
          attended?: boolean | null
          class_session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_session_attendance_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_session_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_session_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sessions: {
        Row: {
          class_id: string
          court_id: string | null
          created_at: string
          during: unknown
          id: string
          notes: string | null
          status: string
        }
        Insert: {
          class_id: string
          court_id?: string | null
          created_at?: string
          during: unknown
          id?: string
          notes?: string | null
          status?: string
        }
        Update: {
          class_id?: string
          court_id?: string | null
          created_at?: string
          during?: unknown
          id?: string
          notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          active: boolean
          club_id: string
          coach_id: string
          created_at: string
          currency: Database["public"]["Enums"]["mp_currency"]
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["mp_class_kind"]
          max_students: number
          name: string
          price_cents: number
          recurrence_rule: string | null
          skill_level: Database["public"]["Enums"]["mp_skill_level"] | null
          sport: Database["public"]["Enums"]["mp_sport"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          club_id: string
          coach_id: string
          created_at?: string
          currency: Database["public"]["Enums"]["mp_currency"]
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["mp_class_kind"]
          max_students?: number
          name: string
          price_cents: number
          recurrence_rule?: string | null
          skill_level?: Database["public"]["Enums"]["mp_skill_level"] | null
          sport: Database["public"]["Enums"]["mp_sport"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          club_id?: string
          coach_id?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"]
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["mp_class_kind"]
          max_students?: number
          name?: string
          price_cents?: number
          recurrence_rule?: string | null
          skill_level?: Database["public"]["Enums"]["mp_skill_level"] | null
          sport?: Database["public"]["Enums"]["mp_sport"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_amenities: {
        Row: {
          amenity: string
          club_id: string
        }
        Insert: {
          amenity: string
          club_id: string
        }
        Update: {
          amenity?: string
          club_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_amenities_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_amenities_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      club_application_courts: {
        Row: {
          application_id: string
          base_price_cents: number | null
          close_time: string | null
          created_at: string
          currency: Database["public"]["Enums"]["mp_currency"] | null
          id: string
          indoor: boolean
          lights: boolean
          open_time: string | null
          ordinal: number
          proposed_code: string
          sport: Database["public"]["Enums"]["mp_sport"]
          surface: string | null
        }
        Insert: {
          application_id: string
          base_price_cents?: number | null
          close_time?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          id?: string
          indoor?: boolean
          lights?: boolean
          open_time?: string | null
          ordinal?: number
          proposed_code: string
          sport: Database["public"]["Enums"]["mp_sport"]
          surface?: string | null
        }
        Update: {
          application_id?: string
          base_price_cents?: number | null
          close_time?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          id?: string
          indoor?: boolean
          lights?: boolean
          open_time?: string | null
          ordinal?: number
          proposed_code?: string
          sport?: Database["public"]["Enums"]["mp_sport"]
          surface?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_application_courts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "club_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      club_application_documents: {
        Row: {
          application_id: string
          filename: string | null
          id: string
          kind: Database["public"]["Enums"]["mp_club_doc_kind"]
          mime_type: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number | null
          status: Database["public"]["Enums"]["mp_club_doc_status"]
          storage_path: string | null
          uploaded_at: string | null
        }
        Insert: {
          application_id: string
          filename?: string | null
          id?: string
          kind: Database["public"]["Enums"]["mp_club_doc_kind"]
          mime_type?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["mp_club_doc_status"]
          storage_path?: string | null
          uploaded_at?: string | null
        }
        Update: {
          application_id?: string
          filename?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["mp_club_doc_kind"]
          mime_type?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["mp_club_doc_status"]
          storage_path?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "club_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_application_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_application_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_application_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          application_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["mp_club_app_event_kind"]
          note: string | null
          payload: Json | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          application_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["mp_club_app_event_kind"]
          note?: string | null
          payload?: Json | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          application_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["mp_club_app_event_kind"]
          note?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "club_application_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_application_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "club_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      club_application_photos: {
        Row: {
          application_id: string
          caption: string | null
          created_at: string
          id: string
          ordinal: number
          storage_path: string
        }
        Insert: {
          application_id: string
          caption?: string | null
          created_at?: string
          id?: string
          ordinal?: number
          storage_path: string
        }
        Update: {
          application_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          ordinal?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_application_photos_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "club_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      club_applications: {
        Row: {
          address: string | null
          applicant_id: string
          approved_at: string | null
          cancellation_policy:
            | Database["public"]["Enums"]["mp_cancellation_policy"]
            | null
          code: string
          commission_pct: number
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          currency: Database["public"]["Enums"]["mp_currency"] | null
          current_step: number
          district: string | null
          founded_year: number | null
          geo: unknown
          geo_lat: number | null
          geo_lng: number | null
          id: string
          legal_name: string | null
          location_verified_at: string | null
          location_verified_by: string | null
          name: string | null
          org_type: Database["public"]["Enums"]["mp_club_org_type"] | null
          parking: Database["public"]["Enums"]["mp_parking_type"] | null
          province: string | null
          reference_note: string | null
          rejected_at: string | null
          rejection_reason: string | null
          resulting_club_id: string | null
          review_started_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          short_description: string | null
          sports: Database["public"]["Enums"]["mp_sport"][] | null
          status: Database["public"]["Enums"]["mp_club_app_status"]
          submitted_at: string | null
          tax_id: string | null
          terms_accepted_at: string | null
          updated_at: string
          version: number
          website_or_social: string | null
          weekly_hours: Json | null
        }
        Insert: {
          address?: string | null
          applicant_id: string
          approved_at?: string | null
          cancellation_policy?:
            | Database["public"]["Enums"]["mp_cancellation_policy"]
            | null
          code?: string
          commission_pct?: number
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          current_step?: number
          district?: string | null
          founded_year?: number | null
          geo?: unknown
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          legal_name?: string | null
          location_verified_at?: string | null
          location_verified_by?: string | null
          name?: string | null
          org_type?: Database["public"]["Enums"]["mp_club_org_type"] | null
          parking?: Database["public"]["Enums"]["mp_parking_type"] | null
          province?: string | null
          reference_note?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          resulting_club_id?: string | null
          review_started_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          short_description?: string | null
          sports?: Database["public"]["Enums"]["mp_sport"][] | null
          status?: Database["public"]["Enums"]["mp_club_app_status"]
          submitted_at?: string | null
          tax_id?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          version?: number
          website_or_social?: string | null
          weekly_hours?: Json | null
        }
        Update: {
          address?: string | null
          applicant_id?: string
          approved_at?: string | null
          cancellation_policy?:
            | Database["public"]["Enums"]["mp_cancellation_policy"]
            | null
          code?: string
          commission_pct?: number
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          current_step?: number
          district?: string | null
          founded_year?: number | null
          geo?: unknown
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          legal_name?: string | null
          location_verified_at?: string | null
          location_verified_by?: string | null
          name?: string | null
          org_type?: Database["public"]["Enums"]["mp_club_org_type"] | null
          parking?: Database["public"]["Enums"]["mp_parking_type"] | null
          province?: string | null
          reference_note?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          resulting_club_id?: string | null
          review_started_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          short_description?: string | null
          sports?: Database["public"]["Enums"]["mp_sport"][] | null
          status?: Database["public"]["Enums"]["mp_club_app_status"]
          submitted_at?: string | null
          tax_id?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
          version?: number
          website_or_social?: string | null
          weekly_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "club_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_applications_location_verified_by_fkey"
            columns: ["location_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_applications_location_verified_by_fkey"
            columns: ["location_verified_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_applications_resulting_club_id_fkey"
            columns: ["resulting_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_applications_resulting_club_id_fkey"
            columns: ["resulting_club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_applications_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_applications_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_photos: {
        Row: {
          caption: string | null
          club_id: string
          created_at: string
          id: string
          ordinal: number
          url: string
        }
        Insert: {
          caption?: string | null
          club_id: string
          created_at?: string
          id?: string
          ordinal?: number
          url: string
        }
        Update: {
          caption?: string | null
          club_id?: string
          created_at?: string
          id?: string
          ordinal?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_photos_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_photos_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      club_reviews: {
        Row: {
          club_id: string
          comment: string | null
          created_at: string
          id: string
          nps: number | null
          rating: number
          reservation_id: string | null
          user_id: string
        }
        Insert: {
          club_id: string
          comment?: string | null
          created_at?: string
          id?: string
          nps?: number | null
          rating: number
          reservation_id?: string | null
          user_id: string
        }
        Update: {
          club_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          nps?: number | null
          rating?: number
          reservation_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_reviews_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_reviews_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_reviews_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_settings: {
        Row: {
          allow_walkins: boolean
          cancellation_window_hours: number
          charge_no_show_pct: number
          club_id: string
          default_slot_minutes: number
          open_hours: Json
          reservation_window_days: number
          updated_at: string
        }
        Insert: {
          allow_walkins?: boolean
          cancellation_window_hours?: number
          charge_no_show_pct?: number
          club_id: string
          default_slot_minutes?: number
          open_hours?: Json
          reservation_window_days?: number
          updated_at?: string
        }
        Update: {
          allow_walkins?: boolean
          cancellation_window_hours?: number
          charge_no_show_pct?: number
          club_id?: string
          default_slot_minutes?: number
          open_hours?: Json
          reservation_window_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_settings_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          address: string | null
          applied_by: string | null
          approved_at: string | null
          approved_by: string | null
          city: string
          country: string
          cover_url: string | null
          created_at: string
          currency: Database["public"]["Enums"]["mp_currency"]
          description: string | null
          email: string | null
          geo: unknown
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          slug: string
          sports: Database["public"]["Enums"]["mp_sport"][]
          status: string
          timezone: string
          updated_at: string
          version: number
        }
        Insert: {
          address?: string | null
          applied_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city: string
          country: string
          cover_url?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"]
          description?: string | null
          email?: string | null
          geo?: unknown
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          slug: string
          sports?: Database["public"]["Enums"]["mp_sport"][]
          status?: string
          timezone?: string
          updated_at?: string
          version?: number
        }
        Update: {
          address?: string | null
          applied_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          city?: string
          country?: string
          cover_url?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"]
          description?: string | null
          email?: string | null
          geo?: unknown
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          slug?: string
          sports?: Database["public"]["Enums"]["mp_sport"][]
          status?: string
          timezone?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "clubs_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clubs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_availability: {
        Row: {
          club_id: string | null
          coach_id: string
          day_of_week: number
          ends_at: string
          id: string
          starts_at: string
        }
        Insert: {
          club_id?: string | null
          coach_id: string
          day_of_week: number
          ends_at: string
          id?: string
          starts_at: string
        }
        Update: {
          club_id?: string | null
          coach_id?: string
          day_of_week?: number
          ends_at?: string
          id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_availability_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_availability_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_availability_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_certifications: {
        Row: {
          coach_id: string
          document_url: string | null
          id: string
          issued_year: number | null
          issuer: string | null
          name: string
          verified_at: string | null
        }
        Insert: {
          coach_id: string
          document_url?: string | null
          id?: string
          issued_year?: number | null
          issuer?: string | null
          name: string
          verified_at?: string | null
        }
        Update: {
          coach_id?: string
          document_url?: string | null
          id?: string
          issued_year?: number | null
          issuer?: string | null
          name?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_certifications_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_clubs: {
        Row: {
          active: boolean
          club_id: string
          coach_id: string
          commission_pct: number
          joined_at: string
        }
        Insert: {
          active?: boolean
          club_id: string
          coach_id: string
          commission_pct?: number
          joined_at?: string
        }
        Update: {
          active?: boolean
          club_id?: string
          coach_id?: string
          commission_pct?: number
          joined_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_clubs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_clubs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_clubs_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_profiles: {
        Row: {
          bio: string | null
          created_at: string
          currency: Database["public"]["Enums"]["mp_currency"] | null
          headline: string | null
          hourly_rate_cents: number | null
          id: string
          intro_video_url: string | null
          primary_sport: Database["public"]["Enums"]["mp_sport"] | null
          rating_avg: number | null
          rating_count: number
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          years_experience: number | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          headline?: string | null
          hourly_rate_cents?: number | null
          id: string
          intro_video_url?: string | null
          primary_sport?: Database["public"]["Enums"]["mp_sport"] | null
          rating_avg?: number | null
          rating_count?: number
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          years_experience?: number | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          headline?: string | null
          hourly_rate_cents?: number | null
          id?: string
          intro_video_url?: string | null
          primary_sport?: Database["public"]["Enums"]["mp_sport"] | null
          rating_avg?: number | null
          rating_count?: number
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_profiles_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_profiles_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_reviews: {
        Row: {
          coach_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          reviewer_id: string
        }
        Insert: {
          coach_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          reviewer_id: string
        }
        Update: {
          coach_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_reviews_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_specialties: {
        Row: {
          coach_id: string
          proficiency: number
          specialty: string
          sport: Database["public"]["Enums"]["mp_sport"]
        }
        Insert: {
          coach_id: string
          proficiency: number
          specialty: string
          sport: Database["public"]["Enums"]["mp_sport"]
        }
        Update: {
          coach_id?: string
          proficiency?: number
          specialty?: string
          sport?: Database["public"]["Enums"]["mp_sport"]
        }
        Relationships: [
          {
            foreignKeyName: "coach_specialties_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_message_id: string | null
          left_at: string | null
          muted_until: string | null
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_message_id?: string | null
          left_at?: string | null
          muted_until?: string | null
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_message_id?: string | null
          left_at?: string | null
          muted_until?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          club_id: string | null
          created_at: string
          created_by: string
          id: string
          kind: string
          last_message_at: string | null
          title: string | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          kind: string
          last_message_at?: string | null
          title?: string | null
        }
        Update: {
          club_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          last_message_at?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      court_blocks: {
        Row: {
          court_id: string
          created_at: string
          created_by: string | null
          during: unknown
          id: string
          reason: string
        }
        Insert: {
          court_id: string
          created_at?: string
          created_by?: string | null
          during: unknown
          id?: string
          reason: string
        }
        Update: {
          court_id?: string
          created_at?: string
          created_by?: string | null
          during?: unknown
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_blocks_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "court_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      court_pricing: {
        Row: {
          active: boolean
          court_id: string
          currency: Database["public"]["Enums"]["mp_currency"]
          day_of_week: number | null
          duration_minutes: number
          ends_at: string
          id: string
          price_cents: number
          starts_at: string
        }
        Insert: {
          active?: boolean
          court_id: string
          currency: Database["public"]["Enums"]["mp_currency"]
          day_of_week?: number | null
          duration_minutes?: number
          ends_at: string
          id?: string
          price_cents: number
          starts_at: string
        }
        Update: {
          active?: boolean
          court_id?: string
          currency?: Database["public"]["Enums"]["mp_currency"]
          day_of_week?: number | null
          duration_minutes?: number
          ends_at?: string
          id?: string
          price_cents?: number
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "court_pricing_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
        ]
      }
      courts: {
        Row: {
          active: boolean
          club_id: string
          code: string
          created_at: string
          id: string
          indoor: boolean
          lights: boolean
          name: string | null
          ordinal: number
          sport: Database["public"]["Enums"]["mp_sport"]
          surface: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          club_id: string
          code: string
          created_at?: string
          id?: string
          indoor?: boolean
          lights?: boolean
          name?: string | null
          ordinal?: number
          sport: Database["public"]["Enums"]["mp_sport"]
          surface?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          club_id?: string
          code?: string
          created_at?: string
          id?: string
          indoor?: boolean
          lights?: boolean
          name?: string | null
          ordinal?: number
          sport?: Database["public"]["Enums"]["mp_sport"]
          surface?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      event_check_ins: {
        Row: {
          checked_in_at: string
          checked_in_by: string | null
          event_registration_id: string
        }
        Insert: {
          checked_in_at?: string
          checked_in_by?: string | null
          event_registration_id: string
        }
        Update: {
          checked_in_at?: string
          checked_in_by?: string | null
          event_registration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_check_ins_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_check_ins_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_check_ins_event_registration_id_fkey"
            columns: ["event_registration_id"]
            isOneToOne: true
            referencedRelation: "event_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          paid_transaction_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          paid_transaction_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          paid_transaction_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_paid_transaction_id_fkey"
            columns: ["paid_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          club_id: string | null
          cover_url: string | null
          created_at: string
          currency: Database["public"]["Enums"]["mp_currency"] | null
          description: string | null
          ends_at: string
          id: string
          kind: string
          name: string
          organizer_id: string
          partner_id: string | null
          payment_policy: Database["public"]["Enums"]["mp_event_payment_policy"]
          price_cents: number
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["mp_event_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["mp_visibility"]
        }
        Insert: {
          capacity?: number | null
          club_id?: string | null
          cover_url?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          description?: string | null
          ends_at: string
          id?: string
          kind: string
          name: string
          organizer_id: string
          partner_id?: string | null
          payment_policy?: Database["public"]["Enums"]["mp_event_payment_policy"]
          price_cents?: number
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["mp_event_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["mp_visibility"]
        }
        Update: {
          capacity?: number | null
          club_id?: string | null
          cover_url?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          description?: string | null
          ends_at?: string
          id?: string
          kind?: string
          name?: string
          organizer_id?: string
          partner_id?: string | null
          payment_policy?: Database["public"]["Enums"]["mp_event_payment_policy"]
          price_cents?: number
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["mp_event_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["mp_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_partner_fk"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_assignments: {
        Row: {
          enabled: boolean
          flag_key: string
          reason: string | null
          scope: string
          scope_id: string
        }
        Insert: {
          enabled: boolean
          flag_key: string
          reason?: string | null
          scope: string
          scope_id: string
        }
        Update: {
          enabled?: boolean
          flag_key?: string
          reason?: string | null
          scope?: string
          scope_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_assignments_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string
          enabled_default: boolean
          key: string
          rollout_pct: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          enabled_default?: boolean
          key: string
          rollout_pct?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          enabled_default?: boolean
          key?: string
          rollout_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          responded_at: string | null
          status: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          responded_at?: string | null
          status?: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          responded_at?: string | null
          status?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          since: string
          user_a: string
          user_b: string
        }
        Insert: {
          since?: string
          user_a: string
          user_b: string
        }
        Update: {
          since?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          expires_at: string
          key: string
          request_hash: string | null
          response: Json
          scope: string
          status_code: number
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          key: string
          request_hash?: string | null
          response: Json
          scope: string
          status_code: number
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          key?: string
          request_hash?: string | null
          response?: Json
          scope?: string
          status_code?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idempotency_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string
          delta: number
          id: string
          product_id: string
          reason: string
          ref_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          delta: number
          id?: string
          product_id: string
          reason: string
          ref_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          delta?: number
          id?: string
          product_id?: string
          reason?: string
          ref_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          cover_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          partner_id: string | null
          season: string | null
          slug: string
          sport: Database["public"]["Enums"]["mp_sport"]
          status: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          partner_id?: string | null
          season?: string | null
          slug: string
          sport: Database["public"]["Enums"]["mp_sport"]
          status?: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          partner_id?: string | null
          season?: string | null
          slug?: string
          sport?: Database["public"]["Enums"]["mp_sport"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_partner_fk"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons_1on1: {
        Row: {
          club_id: string
          coach_id: string
          court_id: string | null
          created_at: string
          currency: Database["public"]["Enums"]["mp_currency"]
          during: unknown
          id: string
          notes: string | null
          paid_transaction_id: string | null
          price_cents: number
          status: Database["public"]["Enums"]["mp_reservation_status"]
          student_id: string
        }
        Insert: {
          club_id: string
          coach_id: string
          court_id?: string | null
          created_at?: string
          currency: Database["public"]["Enums"]["mp_currency"]
          during: unknown
          id?: string
          notes?: string | null
          paid_transaction_id?: string | null
          price_cents: number
          status?: Database["public"]["Enums"]["mp_reservation_status"]
          student_id: string
        }
        Update: {
          club_id?: string
          coach_id?: string
          court_id?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"]
          during?: unknown
          id?: string
          notes?: string | null
          paid_transaction_id?: string | null
          price_cents?: number
          status?: Database["public"]["Enums"]["mp_reservation_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_1on1_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_1on1_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_1on1_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_1on1_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_1on1_paid_transaction_id_fkey"
            columns: ["paid_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_1on1_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_1on1_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          club_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          disputed_reason: string | null
          id: string
          played_at: string
          reported_by: string
          reservation_id: string | null
          side_a: Json
          side_b: Json
          sport: Database["public"]["Enums"]["mp_sport"]
          status: Database["public"]["Enums"]["mp_match_status"]
          tournament_match_id: string | null
          winner_side: string | null
        }
        Insert: {
          club_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          disputed_reason?: string | null
          id?: string
          played_at: string
          reported_by: string
          reservation_id?: string | null
          side_a: Json
          side_b: Json
          sport: Database["public"]["Enums"]["mp_sport"]
          status?: Database["public"]["Enums"]["mp_match_status"]
          tournament_match_id?: string | null
          winner_side?: string | null
        }
        Update: {
          club_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          disputed_reason?: string | null
          id?: string
          played_at?: string
          reported_by?: string
          reservation_id?: string | null
          side_a?: Json
          side_b?: Json
          sport?: Database["public"]["Enums"]["mp_sport"]
          status?: Database["public"]["Enums"]["mp_match_status"]
          tournament_match_id?: string | null
          winner_side?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_results_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mr_tournament_match_fk"
            columns: ["tournament_match_id"]
            isOneToOne: false
            referencedRelation: "bracket_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          id: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          id?: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          id?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          kind: string
          payload: Json | null
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind?: string
          payload?: Json | null
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          kind?: string
          payload?: Json | null
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: string
          duration_hours: number | null
          id: string
          performed_at: string
          performed_by: string
          reason: string
          report_id: string | null
          target_entity: string | null
          target_entity_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          duration_hours?: number | null
          id?: string
          performed_at?: string
          performed_by: string
          reason: string
          report_id?: string | null
          target_entity?: string | null
          target_entity_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          duration_hours?: number | null
          id?: string
          performed_at?: string
          performed_by?: string
          reason?: string
          report_id?: string | null
          target_entity?: string | null
          target_entity_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_jobs: {
        Row: {
          attempts: number
          channel: Database["public"]["Enums"]["mp_notification_channel"]
          created_at: string
          id: string
          kind: string
          last_error: string | null
          payload: Json
          role: Database["public"]["Enums"]["mp_role"]
          scheduled_for: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: Database["public"]["Enums"]["mp_notification_channel"]
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          payload: Json
          role: Database["public"]["Enums"]["mp_role"]
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["mp_notification_channel"]
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json
          role?: Database["public"]["Enums"]["mp_role"]
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_jobs_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "notification_kinds"
            referencedColumns: ["kind"]
          },
          {
            foreignKeyName: "notification_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_kinds: {
        Row: {
          allowed_roles: Database["public"]["Enums"]["mp_role"][]
          category: string
          created_at: string
          default_channels: Database["public"]["Enums"]["mp_notification_channel"][]
          description: string
          kind: string
        }
        Insert: {
          allowed_roles: Database["public"]["Enums"]["mp_role"][]
          category: string
          created_at?: string
          default_channels: Database["public"]["Enums"]["mp_notification_channel"][]
          description: string
          kind: string
        }
        Update: {
          allowed_roles?: Database["public"]["Enums"]["mp_role"][]
          category?: string
          created_at?: string
          default_channels?: Database["public"]["Enums"]["mp_notification_channel"][]
          description?: string
          kind?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          channel: Database["public"]["Enums"]["mp_notification_channel"]
          enabled: boolean
          kind: string
          role: Database["public"]["Enums"]["mp_role"]
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["mp_notification_channel"]
          enabled?: boolean
          kind: string
          role: Database["public"]["Enums"]["mp_role"]
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["mp_notification_channel"]
          enabled?: boolean
          kind?: string
          role?: Database["public"]["Enums"]["mp_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "notification_kinds"
            referencedColumns: ["kind"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          ua: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          ua?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          ua?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_template: string
          channel: Database["public"]["Enums"]["mp_notification_channel"]
          id: string
          kind: string
          locale: string
          subject: string | null
        }
        Insert: {
          body_template: string
          channel: Database["public"]["Enums"]["mp_notification_channel"]
          id?: string
          kind: string
          locale?: string
          subject?: string | null
        }
        Update: {
          body_template?: string
          channel?: Database["public"]["Enums"]["mp_notification_channel"]
          id?: string
          kind?: string
          locale?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "notification_kinds"
            referencedColumns: ["kind"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          recipient_role: Database["public"]["Enums"]["mp_role"]
          recipient_user_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          recipient_role: Database["public"]["Enums"]["mp_role"]
          recipient_user_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          recipient_role?: Database["public"]["Enums"]["mp_role"]
          recipient_user_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "notification_kinds"
            referencedColumns: ["kind"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_club_links: {
        Row: {
          club_id: string
          linked_at: string
          partner_id: string
          revenue_share_pct: number
        }
        Insert: {
          club_id: string
          linked_at?: string
          partner_id: string
          revenue_share_pct?: number
        }
        Update: {
          club_id?: string
          linked_at?: string
          partner_id?: string
          revenue_share_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "partner_club_links_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_club_links_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_club_links_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_members: {
        Row: {
          joined_at: string
          partner_id: string
          role: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          partner_id: string
          role?: string
          user_id: string
        }
        Update: {
          joined_at?: string
          partner_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_members_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_orgs: {
        Row: {
          contact_email: string | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          club_id: string | null
          coach_id: string | null
          commission_cents: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["mp_currency"]
          gross_cents: number
          id: string
          net_cents: number
          paid_at: string | null
          partner_id: string | null
          period_end: string
          period_start: string
          provider: string | null
          provider_payout_id: string | null
          scheduled_for: string | null
          scope: string
          status: string
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          coach_id?: string | null
          commission_cents: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["mp_currency"]
          gross_cents: number
          id?: string
          net_cents: number
          paid_at?: string | null
          partner_id?: string | null
          period_end: string
          period_start: string
          provider?: string | null
          provider_payout_id?: string | null
          scheduled_for?: string | null
          scope: string
          status?: string
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          coach_id?: string | null
          commission_cents?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["mp_currency"]
          gross_cents?: number
          id?: string
          net_cents?: number
          paid_at?: string | null
          partner_id?: string | null
          period_end?: string
          period_start?: string
          provider?: string | null
          provider_payout_id?: string | null
          scheduled_for?: string | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      player_stats: {
        Row: {
          current_rating: number
          last_match_at: string | null
          losses: number
          matches_total: number
          peak_rating: number
          sport: Database["public"]["Enums"]["mp_sport"]
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          current_rating?: number
          last_match_at?: string | null
          losses?: number
          matches_total?: number
          peak_rating?: number
          sport: Database["public"]["Enums"]["mp_sport"]
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          current_rating?: number
          last_match_at?: string | null
          losses?: number
          matches_total?: number
          peak_rating?: number
          sport?: Database["public"]["Enums"]["mp_sport"]
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_subscriptions: {
        Row: {
          cancelled_reason: string | null
          created_at: string
          duration_months: number
          expires_at: string | null
          id: string
          starts_at: string | null
          status: string
          tier: Database["public"]["Enums"]["mp_player_plan"]
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_reason?: string | null
          created_at?: string
          duration_months?: number
          expires_at?: string | null
          id?: string
          starts_at?: string | null
          status?: string
          tier: Database["public"]["Enums"]["mp_player_plan"]
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_reason?: string | null
          created_at?: string
          duration_months?: number
          expires_at?: string | null
          id?: string
          starts_at?: string | null
          status?: string
          tier?: Database["public"]["Enums"]["mp_player_plan"]
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_subscriptions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          club_id: string | null
          id: string
          name: string
          ordinal: number
          slug: string
        }
        Insert: {
          club_id?: string | null
          id?: string
          name: string
          ordinal?: number
          slug: string
        }
        Update: {
          club_id?: string | null
          id?: string
          name?: string
          ordinal?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          attributes: Json | null
          category_id: string | null
          club_id: string | null
          cover_url: string | null
          created_at: string
          currency: Database["public"]["Enums"]["mp_currency"]
          description: string | null
          id: string
          low_stock_threshold: number
          name: string
          price_cents: number
          sku: string | null
          stock: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          attributes?: Json | null
          category_id?: string | null
          club_id?: string | null
          cover_url?: string | null
          created_at?: string
          currency: Database["public"]["Enums"]["mp_currency"]
          description?: string | null
          id?: string
          low_stock_threshold?: number
          name: string
          price_cents: number
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          attributes?: Json | null
          category_id?: string | null
          club_id?: string | null
          cover_url?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"]
          description?: string | null
          id?: string
          low_stock_threshold?: number
          name?: string
          price_cents?: number
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birthdate: string | null
          city: string | null
          country: string | null
          created_at: string
          display_name: string
          id: string
          locale: string
          onboarded_at: string | null
          phone: string | null
          phone_verified_at: string | null
          plan_expires_at: string | null
          plan_tier: Database["public"]["Enums"]["mp_player_plan"]
          preferred_sport: Database["public"]["Enums"]["mp_sport"] | null
          skill_level: Database["public"]["Enums"]["mp_skill_level"] | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name: string
          id: string
          locale?: string
          onboarded_at?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          plan_expires_at?: string | null
          plan_tier?: Database["public"]["Enums"]["mp_player_plan"]
          preferred_sport?: Database["public"]["Enums"]["mp_sport"] | null
          skill_level?: Database["public"]["Enums"]["mp_skill_level"] | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string
          id?: string
          locale?: string
          onboarded_at?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          plan_expires_at?: string | null
          plan_tier?: Database["public"]["Enums"]["mp_player_plan"]
          preferred_sport?: Database["public"]["Enums"]["mp_sport"] | null
          skill_level?: Database["public"]["Enums"]["mp_skill_level"] | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      ranking_snapshots: {
        Row: {
          id: string
          rank_position: number | null
          rating: number
          snapshot_at: string
          sport: Database["public"]["Enums"]["mp_sport"]
          user_id: string
        }
        Insert: {
          id?: string
          rank_position?: number | null
          rating: number
          snapshot_at?: string
          sport: Database["public"]["Enums"]["mp_sport"]
          user_id: string
        }
        Update: {
          id?: string
          rank_position?: number | null
          rating?: number
          snapshot_at?: string
          sport?: Database["public"]["Enums"]["mp_sport"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ranking_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ranking_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          capacity: number
          refill_per_second: number
          refilled_at: string
          tokens: number
        }
        Insert: {
          bucket_key: string
          capacity: number
          refill_per_second: number
          refilled_at?: string
          tokens: number
        }
        Update: {
          bucket_key?: string
          capacity?: number
          refill_per_second?: number
          refilled_at?: string
          tokens?: number
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string
          id: string
          reason: string
          refund_transaction_id: string | null
          transaction_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by: string
          id?: string
          reason: string
          refund_transaction_id?: string | null
          transaction_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string
          id?: string
          reason?: string
          refund_transaction_id?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_refund_transaction_id_fkey"
            columns: ["refund_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          paid_transaction_id: string | null
          player_ids: string[]
          registered_by: string
          status: string
          team_id: string | null
          tournament_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          paid_transaction_id?: string | null
          player_ids: string[]
          registered_by: string
          status?: string
          team_id?: string | null
          tournament_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          paid_transaction_id?: string | null
          player_ids?: string[]
          registered_by?: string
          status?: string
          team_id?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tournament_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_paid_transaction_id_fkey"
            columns: ["paid_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments_public_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          entity: string
          entity_id: string
          id: string
          reason: string
          reporter_id: string
          resolution_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["mp_report_status"]
        }
        Insert: {
          created_at?: string
          details?: string | null
          entity: string
          entity_id: string
          id?: string
          reason: string
          reporter_id: string
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["mp_report_status"]
        }
        Update: {
          created_at?: string
          details?: string | null
          entity?: string
          entity_id?: string
          id?: string
          reason?: string
          reporter_id?: string
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["mp_report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_participants: {
        Row: {
          invited_by: string | null
          joined_at: string | null
          reservation_id: string
          status: string
          user_id: string
        }
        Insert: {
          invited_by?: string | null
          joined_at?: string | null
          reservation_id: string
          status?: string
          user_id: string
        }
        Update: {
          invited_by?: string | null
          joined_at?: string | null
          reservation_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_participants_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_participants_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_participants_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: Database["public"]["Enums"]["mp_currency"]
          id: string
          method: Database["public"]["Enums"]["mp_payment_method"]
          reservation_id: string
          status: Database["public"]["Enums"]["mp_payment_status"]
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: Database["public"]["Enums"]["mp_currency"]
          id?: string
          method: Database["public"]["Enums"]["mp_payment_method"]
          reservation_id: string
          status?: Database["public"]["Enums"]["mp_payment_status"]
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"]
          id?: string
          method?: Database["public"]["Enums"]["mp_payment_method"]
          reservation_id?: string
          status?: Database["public"]["Enums"]["mp_payment_status"]
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_payments_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resp_tx_fk"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          club_id: string
          court_id: string
          created_at: string
          during: unknown
          id: string
          max_players: number
          notes: string | null
          organizer_id: string
          source: string
          sport: Database["public"]["Enums"]["mp_sport"]
          status: Database["public"]["Enums"]["mp_reservation_status"]
          updated_at: string
          version: number
          visibility: Database["public"]["Enums"]["mp_visibility"]
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          club_id: string
          court_id: string
          created_at?: string
          during: unknown
          id?: string
          max_players?: number
          notes?: string | null
          organizer_id: string
          source?: string
          sport: Database["public"]["Enums"]["mp_sport"]
          status?: Database["public"]["Enums"]["mp_reservation_status"]
          updated_at?: string
          version?: number
          visibility?: Database["public"]["Enums"]["mp_visibility"]
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          club_id?: string
          court_id?: string
          created_at?: string
          during?: unknown
          id?: string
          max_players?: number
          notes?: string | null
          organizer_id?: string
          source?: string
          sport?: Database["public"]["Enums"]["mp_sport"]
          status?: Database["public"]["Enums"]["mp_reservation_status"]
          updated_at?: string
          version?: number
          visibility?: Database["public"]["Enums"]["mp_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "reservations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_access: {
        Row: {
          class_id: string | null
          granted_at: string
          granted_by: string
          resource_id: string
          user_id: string | null
        }
        Insert: {
          class_id?: string | null
          granted_at?: string
          granted_by: string
          resource_id: string
          user_id?: string | null
        }
        Update: {
          class_id?: string | null
          granted_at?: string
          granted_by?: string
          resource_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_access_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_access_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_files: {
        Row: {
          id: string
          mime_type: string | null
          ordinal: number
          resource_id: string
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          id?: string
          mime_type?: string | null
          ordinal?: number
          resource_id: string
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          id?: string
          mime_type?: string | null
          ordinal?: number
          resource_id?: string
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_files_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_views: {
        Row: {
          id: string
          progress_pct: number
          resource_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          progress_pct?: number
          resource_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          progress_pct?: number
          resource_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_views_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          club_id: string | null
          coach_id: string
          cover_url: string | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          kind: string
          level: Database["public"]["Enums"]["mp_skill_level"] | null
          tags: string[] | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["mp_visibility"]
        }
        Insert: {
          club_id?: string | null
          coach_id: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          kind: string
          level?: Database["public"]["Enums"]["mp_skill_level"] | null
          tags?: string[] | null
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["mp_visibility"]
        }
        Update: {
          club_id?: string | null
          coach_id?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          kind?: string
          level?: Database["public"]["Enums"]["mp_skill_level"] | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["mp_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "resources_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_assignments: {
        Row: {
          club_id: string | null
          granted_at: string
          granted_by: string | null
          id: string
          notes: string | null
          partner_id: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["mp_role"]
          user_id: string
        }
        Insert: {
          club_id?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          partner_id?: string | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["mp_role"]
          user_id: string
        }
        Update: {
          club_id?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          partner_id?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["mp_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_club_fk"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_club_fk"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_partner_fk"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_requests: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          requested_role: Database["public"]["Enums"]["mp_role"]
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          target_club_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          requested_role: Database["public"]["Enums"]["mp_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          target_club_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          requested_role?: Database["public"]["Enums"]["mp_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          target_club_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          product_id: string
          qty: number
          sale_id: string
          unit_price_cents: number
        }
        Insert: {
          product_id: string
          qty: number
          sale_id: string
          unit_price_cents: number
        }
        Update: {
          product_id?: string
          qty?: number
          sale_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cart_id: string | null
          club_id: string
          created_at: string
          currency: Database["public"]["Enums"]["mp_currency"]
          customer_user_id: string | null
          id: string
          sold_by: string | null
          total_cents: number
          transaction_id: string | null
        }
        Insert: {
          cart_id?: string | null
          club_id: string
          created_at?: string
          currency: Database["public"]["Enums"]["mp_currency"]
          customer_user_id?: string | null
          id?: string
          sold_by?: string | null
          total_cents: number
          transaction_id?: string | null
        }
        Update: {
          cart_id?: string | null
          club_id?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["mp_currency"]
          customer_user_id?: string | null
          id?: string
          sold_by?: string | null
          total_cents?: number
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sold_by_fkey"
            columns: ["sold_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sold_by_fkey"
            columns: ["sold_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          id: string
          ip: unknown
          last_seen_at: string | null
          ua: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: unknown
          last_seen_at?: string | null
          ua?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: unknown
          last_seen_at?: string | null
          ua?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          clocked_in_at: string | null
          clocked_out_at: string | null
          club_id: string
          created_at: string
          created_by: string | null
          during: unknown
          id: string
          notes: string | null
          role: Database["public"]["Enums"]["mp_role"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clocked_in_at?: string | null
          clocked_out_at?: string | null
          club_id: string
          created_at?: string
          created_by?: string | null
          during: unknown
          id?: string
          notes?: string | null
          role: Database["public"]["Enums"]["mp_role"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clocked_in_at?: string | null
          clocked_out_at?: string | null
          club_id?: string
          created_at?: string
          created_by?: string | null
          during?: unknown
          id?: string
          notes?: string | null
          role?: Database["public"]["Enums"]["mp_role"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      student_evaluations: {
        Row: {
          class_session_id: string | null
          coach_id: string
          created_at: string
          id: string
          scores: Json
          student_id: string
          summary: string | null
        }
        Insert: {
          class_session_id?: string | null
          coach_id: string
          created_at?: string
          id?: string
          scores: Json
          student_id: string
          summary?: string | null
        }
        Update: {
          class_session_id?: string | null
          coach_id?: string
          created_at?: string
          id?: string
          scores?: Json
          student_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_evaluations_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_evaluations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_evaluations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_evaluations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_notes: {
        Row: {
          body: string
          coach_id: string
          created_at: string
          id: string
          student_id: string
          visibility: string
        }
        Insert: {
          body: string
          coach_id: string
          created_at?: string
          id?: string
          student_id: string
          visibility?: string
        }
        Update: {
          body?: string
          coach_id?: string
          created_at?: string
          id?: string
          student_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_notes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_progress: {
        Row: {
          coach_id: string
          current_level: number
          id: string
          skill: string
          student_id: string
          target_level: number | null
          updated_at: string
        }
        Insert: {
          coach_id: string
          current_level: number
          id?: string
          skill: string
          student_id: string
          target_level?: number | null
          updated_at?: string
        }
        Update: {
          coach_id?: string
          current_level?: number
          id?: string
          skill?: string
          student_id?: string
          target_level?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_progress_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coach_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          created_at: string
          id: string
          invited_by: string
          invited_user_id: string
          responded_at: string | null
          status: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by: string
          invited_user_id: string
          responded_at?: string | null
          status?: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string
          responded_at?: string | null
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_join_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          responded_at: string | null
          status: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          responded_at?: string | null
          status?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          responded_at?: string | null
          status?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_join_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          joined_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          captain_id: string
          club_id: string | null
          created_at: string
          description: string | null
          id: string
          invite_code: string
          logo_url: string | null
          name: string
          privacy: string
          slug: string
          sport: Database["public"]["Enums"]["mp_sport"] | null
        }
        Insert: {
          captain_id: string
          club_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          logo_url?: string | null
          name: string
          privacy?: string
          slug: string
          sport?: Database["public"]["Enums"]["mp_sport"] | null
        }
        Update: {
          captain_id?: string
          club_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          invite_code?: string
          logo_url?: string | null
          name?: string
          privacy?: string
          slug?: string
          sport?: Database["public"]["Enums"]["mp_sport"] | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          ticket_message_id: string
        }
        Insert: {
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          ticket_message_id: string
        }
        Update: {
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          ticket_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_message_id_fkey"
            columns: ["ticket_message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assignee_id: string | null
          category: string
          closed_at: string | null
          club_id: string | null
          code: string
          created_at: string
          first_response_at: string | null
          id: string
          opener_id: string
          resolved_at: string | null
          severity: Database["public"]["Enums"]["mp_ticket_severity"]
          status: Database["public"]["Enums"]["mp_ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          category: string
          closed_at?: string | null
          club_id?: string | null
          code?: string
          created_at?: string
          first_response_at?: string | null
          id?: string
          opener_id: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["mp_ticket_severity"]
          status?: Database["public"]["Enums"]["mp_ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          category?: string
          closed_at?: string | null
          club_id?: string | null
          code?: string
          created_at?: string
          first_response_at?: string | null
          id?: string
          opener_id?: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["mp_ticket_severity"]
          status?: Database["public"]["Enums"]["mp_ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_opener_id_fkey"
            columns: ["opener_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_opener_id_fkey"
            columns: ["opener_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_categories: {
        Row: {
          age_max: number | null
          age_min: number | null
          gender: string | null
          id: string
          level: Database["public"]["Enums"]["mp_skill_level"] | null
          max_teams: number | null
          name: string
          tournament_id: string
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          gender?: string | null
          id?: string
          level?: Database["public"]["Enums"]["mp_skill_level"] | null
          max_teams?: number | null
          name: string
          tournament_id: string
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          gender?: string | null
          id?: string
          level?: Database["public"]["Enums"]["mp_skill_level"] | null
          max_teams?: number | null
          name?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_categories_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_categories_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments_public_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          club_id: string | null
          cover_url: string | null
          created_at: string
          created_by: string
          currency: Database["public"]["Enums"]["mp_currency"] | null
          description: string | null
          ends_at: string
          entry_fee_cents: number
          format: Database["public"]["Enums"]["mp_tournament_format"]
          id: string
          league_id: string | null
          max_participants: number | null
          name: string
          partner_id: string | null
          payment_policy: Database["public"]["Enums"]["mp_event_payment_policy"]
          prize_pool_cents: number | null
          registration_closes_at: string | null
          registration_opens_at: string | null
          rules_url: string | null
          slug: string
          sport: Database["public"]["Enums"]["mp_sport"]
          starts_at: string
          status: Database["public"]["Enums"]["mp_event_status"]
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by: string
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          description?: string | null
          ends_at: string
          entry_fee_cents?: number
          format: Database["public"]["Enums"]["mp_tournament_format"]
          id?: string
          league_id?: string | null
          max_participants?: number | null
          name: string
          partner_id?: string | null
          payment_policy?: Database["public"]["Enums"]["mp_event_payment_policy"]
          prize_pool_cents?: number | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rules_url?: string | null
          slug: string
          sport: Database["public"]["Enums"]["mp_sport"]
          starts_at: string
          status?: Database["public"]["Enums"]["mp_event_status"]
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          description?: string | null
          ends_at?: string
          entry_fee_cents?: number
          format?: Database["public"]["Enums"]["mp_tournament_format"]
          id?: string
          league_id?: string | null
          max_participants?: number | null
          name?: string
          partner_id?: string | null
          payment_policy?: Database["public"]["Enums"]["mp_event_payment_policy"]
          prize_pool_cents?: number | null
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          rules_url?: string | null
          slug?: string
          sport?: Database["public"]["Enums"]["mp_sport"]
          starts_at?: string
          status?: Database["public"]["Enums"]["mp_event_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_partner_fk"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_cents: number
          cash_session_id: string | null
          club_id: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["mp_currency"]
          customer_name: string | null
          customer_user_id: string | null
          id: string
          kind: string
          method: Database["public"]["Enums"]["mp_payment_method"]
          proof_rejection_reason: string | null
          proof_reviewed_at: string | null
          proof_reviewed_by: string | null
          proof_submitted_at: string | null
          proof_url: string | null
          provider: string | null
          provider_payment_id: string | null
          receipt_url: string | null
          ref_id: string | null
          refund_reason: string | null
          refund_reference: string | null
          refunded_at: string | null
          refunded_by: string | null
          status: Database["public"]["Enums"]["mp_payment_status"]
        }
        Insert: {
          amount_cents: number
          cash_session_id?: string | null
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["mp_currency"]
          customer_name?: string | null
          customer_user_id?: string | null
          id?: string
          kind: string
          method: Database["public"]["Enums"]["mp_payment_method"]
          proof_rejection_reason?: string | null
          proof_reviewed_at?: string | null
          proof_reviewed_by?: string | null
          proof_submitted_at?: string | null
          proof_url?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          receipt_url?: string | null
          ref_id?: string | null
          refund_reason?: string | null
          refund_reference?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          status?: Database["public"]["Enums"]["mp_payment_status"]
        }
        Update: {
          amount_cents?: number
          cash_session_id?: string | null
          club_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["mp_currency"]
          customer_name?: string | null
          customer_user_id?: string | null
          id?: string
          kind?: string
          method?: Database["public"]["Enums"]["mp_payment_method"]
          proof_rejection_reason?: string | null
          proof_reviewed_at?: string | null
          proof_reviewed_by?: string | null
          proof_submitted_at?: string | null
          proof_url?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          receipt_url?: string | null
          ref_id?: string | null
          refund_reason?: string | null
          refund_reference?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          status?: Database["public"]["Enums"]["mp_payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_user_id_fkey"
            columns: ["customer_user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_refunded_by_fkey"
            columns: ["refunded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_refunded_by_fkey"
            columns: ["refunded_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      walkins: {
        Row: {
          attended_by: string | null
          club_id: string
          court_id: string | null
          created_at: string
          created_reservation_id: string | null
          customer_name: string
          customer_phone: string | null
          duration_minutes: number
          id: string
          notes: string | null
          party_size: number
          sport: Database["public"]["Enums"]["mp_sport"] | null
        }
        Insert: {
          attended_by?: string | null
          club_id: string
          court_id?: string | null
          created_at?: string
          created_reservation_id?: string | null
          customer_name: string
          customer_phone?: string | null
          duration_minutes?: number
          id?: string
          notes?: string | null
          party_size?: number
          sport?: Database["public"]["Enums"]["mp_sport"] | null
        }
        Update: {
          attended_by?: string | null
          club_id?: string
          court_id?: string | null
          created_at?: string
          created_reservation_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          duration_minutes?: number
          id?: string
          notes?: string | null
          party_size?: number
          sport?: Database["public"]["Enums"]["mp_sport"] | null
        }
        Relationships: [
          {
            foreignKeyName: "walkins_attended_by_fkey"
            columns: ["attended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walkins_attended_by_fkey"
            columns: ["attended_by"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walkins_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walkins_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs_public_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walkins_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walkins_created_reservation_id_fkey"
            columns: ["created_reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      clubs_public_summary: {
        Row: {
          city: string | null
          country: string | null
          courts_count: number | null
          cover_url: string | null
          currency: Database["public"]["Enums"]["mp_currency"] | null
          id: string | null
          min_price_cents: number | null
          name: string | null
          slug: string | null
          sports: Database["public"]["Enums"]["mp_sport"][] | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          courts_count?: never
          cover_url?: string | null
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          id?: string | null
          min_price_cents?: never
          name?: string | null
          slug?: string | null
          sports?: Database["public"]["Enums"]["mp_sport"][] | null
        }
        Update: {
          city?: string | null
          country?: string | null
          courts_count?: never
          cover_url?: string | null
          currency?: Database["public"]["Enums"]["mp_currency"] | null
          id?: string | null
          min_price_cents?: never
          name?: string | null
          slug?: string | null
          sports?: Database["public"]["Enums"]["mp_sport"][] | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      mv_user_ranking: {
        Row: {
          current_rating: number | null
          losses: number | null
          rank: number | null
          sport: Database["public"]["Enums"]["mp_sport"] | null
          user_id: string | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments_public_summary: {
        Row: {
          club_city: string | null
          club_name: string | null
          currency: Database["public"]["Enums"]["mp_currency"] | null
          ends_at: string | null
          entry_fee_cents: number | null
          format: Database["public"]["Enums"]["mp_tournament_format"] | null
          id: string | null
          max_participants: number | null
          name: string | null
          prize_pool_cents: number | null
          registrations_count: number | null
          slug: string | null
          sport: Database["public"]["Enums"]["mp_sport"] | null
          starts_at: string | null
          status: Database["public"]["Enums"]["mp_event_status"] | null
        }
        Relationships: []
      }
      v_public_profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          preferred_sport: Database["public"]["Enums"]["mp_sport"] | null
          skill_level: Database["public"]["Enums"]["mp_skill_level"] | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          preferred_sport?: Database["public"]["Enums"]["mp_sport"] | null
          skill_level?: Database["public"]["Enums"]["mp_skill_level"] | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          preferred_sport?: Database["public"]["Enums"]["mp_sport"] | null
          skill_level?: Database["public"]["Enums"]["mp_skill_level"] | null
          username?: string | null
        }
        Relationships: []
      }
      v_unread_notifications: {
        Row: {
          recipient_role: Database["public"]["Enums"]["mp_role"] | null
          recipient_user_id: string | null
          unread: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "v_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      fn_admin_audit_log: {
        Args: {
          p_action: string
          p_diff?: Json
          p_entity: string
          p_entity_id: string
        }
        Returns: undefined
      }
      fn_create_sale: {
        Args: {
          p_club_id: string
          p_customer_name: string
          p_customer_user_id: string
          p_items: Json
          p_method: Database["public"]["Enums"]["mp_payment_method"]
          p_user_id: string
        }
        Returns: string
      }
      fn_enqueue_notification: {
        Args: {
          p_body?: string
          p_kind: string
          p_payload?: Json
          p_role: Database["public"]["Enums"]["mp_role"]
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      fn_materialize_club_from_application: {
        Args: { p_app_id: string }
        Returns: string
      }
      fn_my_effective_flags: {
        Args: never
        Returns: {
          enabled: boolean
          key: string
        }[]
      }
      fn_purge_expired_idempotency: { Args: never; Returns: undefined }
      fn_rate_limit_consume: {
        Args: {
          p_capacity: number
          p_cost?: number
          p_key: string
          p_refill_per_second: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      gen_team_invite_code: { Args: never; Returns: string }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_club_review_stats: {
        Args: { p_club_ids: string[] }
        Returns: {
          avg_rating: number
          club_id: string
          reviews_count: number
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mp_active_club_id: { Args: never; Returns: string }
      mp_active_role: { Args: never; Returns: string }
      mp_club_staff: { Args: { p_club_id: string }; Returns: boolean }
      mp_has_club_access: {
        Args: {
          p_club_id: string
          p_role?: Database["public"]["Enums"]["mp_role"]
        }
        Returns: boolean
      }
      mp_is_admin: { Args: never; Returns: boolean }
      mp_is_coach_in: { Args: { p_club_id: string }; Returns: boolean }
      mp_is_employee_of: { Args: { p_club_id: string }; Returns: boolean }
      mp_is_manager_of: { Args: { p_club_id: string }; Returns: boolean }
      mp_is_owner_of: { Args: { p_club_id: string }; Returns: boolean }
      mp_is_partner_admin_of: {
        Args: { p_partner_id: string }
        Returns: boolean
      }
      mp_partner_has_club: { Args: { p_club_id: string }; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      transfer_team_captain: {
        Args: { p_new_captain_id: string; p_team_id: string }
        Returns: undefined
      }
      unaccent: { Args: { "": string }; Returns: string }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      mp_cancellation_policy: "flexible_24h" | "moderate_48h" | "strict_7d"
      mp_class_kind: "group" | "clinic" | "camp" | "one_on_one" | "semi_private"
      mp_club_app_event_kind:
        | "created"
        | "step_completed"
        | "submitted"
        | "docs_review_started"
        | "docs_approved"
        | "docs_rejected"
        | "field_scheduled"
        | "field_completed"
        | "final_review_started"
        | "approved"
        | "rejected"
        | "withdrawn"
        | "note_added"
        | "contacted"
      mp_club_app_status:
        | "draft"
        | "submitted"
        | "docs_review"
        | "field_verification"
        | "final_review"
        | "approved"
        | "rejected"
        | "withdrawn"
      mp_club_doc_kind:
        | "tax_id_certificate"
        | "incorporation_act"
        | "land_use_permit"
        | "liability_insurance"
        | "health_permit"
        | "other"
      mp_club_doc_status: "pending" | "uploaded" | "approved" | "rejected"
      mp_club_org_type: "private" | "public" | "concession"
      mp_currency: "USD" | "MXN" | "CLP" | "ARS" | "BRL" | "EUR"
      mp_event_payment_policy: "free" | "prepay" | "onsite" | "flexible"
      mp_event_status:
        | "draft"
        | "published"
        | "registration_open"
        | "registration_closed"
        | "live"
        | "finished"
        | "cancelled"
      mp_match_status:
        | "scheduled"
        | "live"
        | "reported"
        | "confirmed"
        | "disputed"
        | "walkover"
        | "cancelled"
      mp_notification_channel: "inapp" | "email" | "push" | "sms"
      mp_parking_type: "unknown" | "street" | "private" | "valet"
      mp_payment_method: "cash" | "card" | "transfer" | "wallet" | "free"
      mp_payment_status:
        | "pending"
        | "authorized"
        | "captured"
        | "refunded"
        | "failed"
        | "disputed"
        | "pending_proof"
        | "proof_submitted"
      mp_player_plan: "free" | "premium"
      mp_report_status: "pending" | "reviewing" | "actioned" | "dismissed"
      mp_reservation_status:
        | "booked"
        | "confirmed"
        | "checked_in"
        | "no_show"
        | "cancelled"
        | "completed"
      mp_role:
        | "admin"
        | "partner"
        | "user"
        | "owner"
        | "manager"
        | "coach"
        | "employee"
      mp_skill_level: "beginner" | "intermediate" | "advanced" | "pro"
      mp_sport: "tennis" | "padel" | "pickleball"
      mp_ticket_severity: "low" | "medium" | "high" | "critical"
      mp_ticket_status:
        | "open"
        | "in_progress"
        | "waiting_user"
        | "resolved"
        | "closed"
      mp_tournament_format:
        | "single_elim"
        | "double_elim"
        | "round_robin"
        | "swiss"
        | "groups_to_knockout"
      mp_visibility: "public" | "members" | "private"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      mp_cancellation_policy: ["flexible_24h", "moderate_48h", "strict_7d"],
      mp_class_kind: ["group", "clinic", "camp", "one_on_one", "semi_private"],
      mp_club_app_event_kind: [
        "created",
        "step_completed",
        "submitted",
        "docs_review_started",
        "docs_approved",
        "docs_rejected",
        "field_scheduled",
        "field_completed",
        "final_review_started",
        "approved",
        "rejected",
        "withdrawn",
        "note_added",
        "contacted",
      ],
      mp_club_app_status: [
        "draft",
        "submitted",
        "docs_review",
        "field_verification",
        "final_review",
        "approved",
        "rejected",
        "withdrawn",
      ],
      mp_club_doc_kind: [
        "tax_id_certificate",
        "incorporation_act",
        "land_use_permit",
        "liability_insurance",
        "health_permit",
        "other",
      ],
      mp_club_doc_status: ["pending", "uploaded", "approved", "rejected"],
      mp_club_org_type: ["private", "public", "concession"],
      mp_currency: ["USD", "MXN", "CLP", "ARS", "BRL", "EUR"],
      mp_event_payment_policy: ["free", "prepay", "onsite", "flexible"],
      mp_event_status: [
        "draft",
        "published",
        "registration_open",
        "registration_closed",
        "live",
        "finished",
        "cancelled",
      ],
      mp_match_status: [
        "scheduled",
        "live",
        "reported",
        "confirmed",
        "disputed",
        "walkover",
        "cancelled",
      ],
      mp_notification_channel: ["inapp", "email", "push", "sms"],
      mp_parking_type: ["unknown", "street", "private", "valet"],
      mp_payment_method: ["cash", "card", "transfer", "wallet", "free"],
      mp_payment_status: [
        "pending",
        "authorized",
        "captured",
        "refunded",
        "failed",
        "disputed",
        "pending_proof",
        "proof_submitted",
      ],
      mp_player_plan: ["free", "premium"],
      mp_report_status: ["pending", "reviewing", "actioned", "dismissed"],
      mp_reservation_status: [
        "booked",
        "confirmed",
        "checked_in",
        "no_show",
        "cancelled",
        "completed",
      ],
      mp_role: [
        "admin",
        "partner",
        "user",
        "owner",
        "manager",
        "coach",
        "employee",
      ],
      mp_skill_level: ["beginner", "intermediate", "advanced", "pro"],
      mp_sport: ["tennis", "padel", "pickleball"],
      mp_ticket_severity: ["low", "medium", "high", "critical"],
      mp_ticket_status: [
        "open",
        "in_progress",
        "waiting_user",
        "resolved",
        "closed",
      ],
      mp_tournament_format: [
        "single_elim",
        "double_elim",
        "round_robin",
        "swiss",
        "groups_to_knockout",
      ],
      mp_visibility: ["public", "members", "private"],
    },
  },
} as const
