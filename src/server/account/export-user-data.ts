import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";

/** Export LOPDP: datos del titular en formato legible (JSON). */
export async function buildUserDataExport(userId: string) {
  const supabase = await getServerClient();
  const admin = getAdminClient();

  const [
    authRes,
    profileRes,
    rolesRes,
    friendshipsRes,
    friendRequestsRes,
    registrationsRes,
    transactionsRes,
    subscriptionsRes,
    notificationsRes,
    matchesRes,
    reservationsRes,
  ] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase
      .from("role_assignments")
      .select("role, club_id, partner_id, granted_at, revoked_at")
      .eq("user_id", userId),
    supabase
      .from("friendships")
      .select("user_a, user_b, created_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`),
    supabase
      .from("friend_requests")
      .select("id, from_user_id, to_user_id, status, created_at")
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`),
    supabase
      .from("registrations")
      .select("id, tournament_id, status, created_at, player_ids, registered_by")
      .or(`registered_by.eq.${userId},player_ids.cs.{${userId}}`),
    supabase
      .from("transactions")
      .select("id, kind, status, amount_cents, currency, created_at, club_id, ref_id")
      .eq("customer_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("player_subscriptions")
      .select("id, status, plan_tier, starts_at, expires_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("notifications")
      .select("id, kind, title, body, created_at, read_at")
      .eq("recipient_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("matches")
      .select("id, status, played_at, format, team_a_player_ids, team_b_player_ids, score")
      .or(`team_a_player_ids.cs.{${userId}},team_b_player_ids.cs.{${userId}}`)
      .order("played_at", { ascending: false })
      .limit(200),
    supabase
      .from("reservations")
      .select("id, club_id, status, starts_at, ends_at, created_at")
      .eq("organizer_id", userId)
      .order("starts_at", { ascending: false })
      .limit(200),
  ]);

  const profile = profileRes.data as (typeof profileRes.data & {
    scheduled_deletion_at?: string | null;
  }) | null;
  const authUser = authRes.data.user;

  return {
    format: "MATCHPOINT-LOPDP-EXPORT-v1",
    exportedAt: new Date().toISOString(),
    subjectId: userId,
    account: {
      email: authUser?.email ?? null,
      emailConfirmedAt: authUser?.email_confirmed_at ?? null,
      lastSignInAt: authUser?.last_sign_in_at ?? null,
      scheduledDeletionAt: profile?.scheduled_deletion_at ?? null,
    },
    profile: profile ?? null,
    roles: rolesRes.data ?? [],
    social: {
      friendships: friendshipsRes.data ?? [],
      friendRequests: friendRequestsRes.data ?? [],
    },
    sportActivity: {
      registrations: registrationsRes.data ?? [],
      matches: matchesRes.data ?? [],
      reservations: reservationsRes.data ?? [],
    },
    billing: {
      transactions: transactionsRes.data ?? [],
      playerSubscriptions: subscriptionsRes.data ?? [],
    },
    notifications: notificationsRes.data ?? [],
    notes: [
      "Los mensajes de chat de terceros no se incluyen para proteger la privacidad de otros usuarios.",
      "Los registros financieros anonimizados pueden conservarse tras el cierre según obligaciones legales.",
    ],
  };
}
