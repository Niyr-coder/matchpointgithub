import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const tables = [
    "profiles","role_assignments","clubs","club_settings","club_amenities",
    "courts","court_pricing","reservations","cash_sessions","transactions",
    "product_categories","products","coach_profiles","coach_clubs","coach_specialties",
    "coach_availability","coach_certifications","coach_reviews","classes","class_sessions",
    "class_enrollments","student_progress","resources","conversations","messages",
    "conversation_members","friendships","friend_requests","teams","team_members",
    "player_stats","tournaments","tournament_categories","events","notification_kinds",
    "notifications","tickets","partner_orgs","partner_members",
  ];
  for (const t of tables) {
    const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
    console.log(t.padEnd(28), error ? `ERR ${error.message}` : count);
  }
}
main();
