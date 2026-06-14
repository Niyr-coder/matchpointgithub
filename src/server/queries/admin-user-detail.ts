// Detalle ampliado de un usuario para el panel lateral de admin-users.
// Usa service role (email auth, friendships, etc.) — nunca importar desde client.
import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import {
  buildEloHistory,
  computeIntegritySignals,
  parseProfileAuditChanges,
} from "@/lib/admin/user-integrity";
import type { AdminUserDetail } from "@/lib/types/admin-user-detail";

export type { AdminUserDetail };

export async function loadAdminUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const admin = getAdminClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    profileRes,
    authRes,
    statsRes,
    ranksRes,
    rolesRes,
    txnsLifetimeRes,
    txnsMonthRes,
    lastTxnRes,
    friendsRes,
    membershipsRes,
    reportsListRes,
    suspensionsRes,
    lastMatchRes,
    mpSubRes,
    auditRes,
    profileAuditRes,
    eloSnapshotsRes,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "display_name,username,city,bio,country,phone,phone_verified_at,locale,preferred_sport,skill_level,created_at,onboarded_at,is_system",
      )
      .eq("id", userId)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
    admin
      .from("player_stats")
      .select("mode,current_rating,matches_total,wins,losses")
      .eq("user_id", userId)
      .eq("sport", "pickleball"),
    admin.from("mv_user_ranking").select("mode,rank").eq("user_id", userId).eq("sport", "pickleball"),
    admin
      .from("role_assignments")
      .select("role,granted_at,clubs(name)")
      .eq("user_id", userId)
      .is("revoked_at", null),
    admin
      .from("transactions")
      .select("amount_cents")
      .eq("customer_user_id", userId)
      .eq("status", "captured"),
    admin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("customer_user_id", userId)
      .eq("status", "captured")
      .gte("created_at", monthStart.toISOString()),
    admin
      .from("transactions")
      .select("created_at")
      .eq("customer_user_id", userId)
      .eq("status", "captured")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("friendships")
      .select("user_a", { count: "exact", head: true })
      .or(`user_a.eq.${userId},user_b.eq.${userId}`),
    admin
      .from("club_memberships")
      .select("status,clubs(name)")
      .eq("user_id", userId)
      .in("status", ["active", "pending"])
      .limit(8),
    admin
      .from("reports")
      .select("id,status,reason,details,created_at,reporter_id")
      .eq("entity", "profile")
      .eq("entity_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("user_suspensions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    admin
      .from("matches")
      .select("played_at")
      .eq("status", "confirmed")
      .or(`team_a_player_ids.cs.{${userId}},team_b_player_ids.cs.{${userId}}`)
      .order("played_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("player_subscriptions")
      .select("status,created_at,expires_at,transaction_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("audit_log")
      .select("action,entity,created_at")
      .or(`entity_id.eq.${userId},actor_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(6),
    admin
      .from("audit_log")
      .select("action,created_at,diff")
      .eq("entity", "profiles")
      .eq("entity_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("ranking_snapshots")
      .select("rating,mode,snapshot_at")
      .eq("user_id", userId)
      .eq("sport", "pickleball")
      .order("snapshot_at", { ascending: false })
      .limit(40),
  ]);

  const profile = profileRes.data;
  if (!profile) return null;

  const spendLifetimeCents = (txnsLifetimeRes.data ?? []).reduce(
    (sum, t) => sum + ((t.amount_cents as number) ?? 0),
    0,
  );

  const mpRow = mpSubRes.data;
  let mpSubscription: AdminUserDetail["mpSubscription"] = null;
  if (mpRow) {
    mpSubscription = {
      status: mpRow.status as string,
      createdAt: mpRow.created_at as string,
      expiresAt: (mpRow.expires_at as string | null) ?? null,
      source: mpRow.transaction_id ? "comprobante" : "admin",
    };
  }

  const sportStats = (statsRes.data ?? []).map((s) => ({
    mode: s.mode as string,
    rating: (s.current_rating as number) ?? 0,
    matches: (s.matches_total as number) ?? 0,
    wins: (s.wins as number) ?? 0,
    losses: (s.losses as number) ?? 0,
  }));

  const profileChanges = parseProfileAuditChanges(profileAuditRes.data ?? []);
  const eloHistory = buildEloHistory(eloSnapshotsRes.data ?? []);

  const reportRows = reportsListRes.data ?? [];
  const openReportsCount = reportRows.filter((r) =>
    ["pending", "reviewing"].includes(r.status as string),
  ).length;

  const reporterIds = Array.from(
    new Set(reportRows.map((r) => r.reporter_id as string).filter(Boolean)),
  );
  const reporterNames = new Map<string, string>();
  if (reporterIds.length > 0) {
    const { data: reporters } = await admin
      .from("profiles")
      .select("id,display_name,username")
      .in("id", reporterIds);
    for (const p of reporters ?? []) {
      reporterNames.set(
        p.id as string,
        (p.display_name as string | null)?.trim() ||
          (p.username ? `@${p.username}` : "Usuario"),
      );
    }
  }

  const skillLevel = (profile.skill_level as string | null) ?? null;
  const integritySignals = computeIntegritySignals({
    skillLevel,
    sportStats,
    eloHistory,
    profileChanges,
    openReportsCount,
  });

  return {
    email: authRes.data.user?.email ?? null,
    lastSignInAt: authRes.data.user?.last_sign_in_at ?? null,
    bio: (profile.bio as string | null) ?? null,
    country: (profile.country as string | null) ?? null,
    phone: (profile.phone as string | null) ?? null,
    phoneVerified: Boolean(profile.phone_verified_at),
    locale: (profile.locale as string) ?? "es",
    preferredSport: (profile.preferred_sport as string | null) ?? null,
    skillLevel,
    createdAt: profile.created_at as string,
    onboardedAt: (profile.onboarded_at as string | null) ?? null,
    isSystem: Boolean(profile.is_system),
    editable: {
      displayName: (profile.display_name as string) ?? "",
      username: (profile.username as string) ?? "",
      city: (profile.city as string) ?? "",
      bio: (profile.bio as string | null) ?? null,
      phone: (profile.phone as string | null) ?? null,
      country: (profile.country as string | null) ?? null,
      skillLevel,
      preferredSport: (profile.preferred_sport as string | null) ?? null,
    },
    roles: (rolesRes.data ?? []).map((r) => {
      const club = r.clubs as { name?: string } | null;
      return {
        role: r.role as string,
        clubName: club?.name ?? null,
        grantedAt: r.granted_at as string,
      };
    }),
    sportStats,
    ranks: (ranksRes.data ?? []).map((r) => ({
      mode: r.mode as string,
      rank: r.rank as number,
    })),
    spendLifetimeCents,
    txnCountMonth: txnsMonthRes.count ?? 0,
    lastTxnAt: (lastTxnRes.data?.created_at as string | null) ?? null,
    friendsCount: friendsRes.count ?? 0,
    clubMemberships: (membershipsRes.data ?? []).map((m) => {
      const club = m.clubs as { name?: string } | null;
      return {
        clubName: club?.name ?? "Club",
        status: m.status as string,
      };
    }),
    openReportsCount,
    suspensionCount: suspensionsRes.count ?? 0,
    lastMatchAt: (lastMatchRes.data?.played_at as string | null) ?? null,
    mpSubscription,
    recentAudit: (auditRes.data ?? []).map((a) => ({
      action: a.action as string,
      entity: a.entity as string,
      at: a.created_at as string,
    })),
    profileChanges,
    eloHistory,
    integritySignals,
    reports: reportRows.map((r) => ({
      id: r.id as string,
      status: r.status as string,
      reason: r.reason as string,
      details: (r.details as string | null) ?? null,
      createdAt: r.created_at as string,
      reporterName: reporterNames.get(r.reporter_id as string) ?? "Usuario",
    })),
  };
}
