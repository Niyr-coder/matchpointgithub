// Server: lista global de usuarios para admin.
import { getServerClient } from "@/lib/db/client.server";
import { AdminUsersScreenView, type UsersData, type UserRow } from "./AdminUsersScreenView";

const AV_GRADIENTS = [
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
  "linear-gradient(135deg,#10b981,#34d399)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AV_GRADIENTS[Math.abs(h) % AV_GRADIENTS.length];
}

async function loadData(): Promise<UsersData> {
  const supabase = await getServerClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: profiles, count: totalCount } = await supabase
    .from("profiles")
    .select("id,username,display_name,city,avatar_url,plan_tier,plan_expires_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(50);

  const userIds = (profiles ?? []).map((p) => p.id as string);
  const ratingByUser = new Map<string, number>();
  const matchesByUser = new Map<string, number>();
  const spendByUser = new Map<string, number>();

  const suspensionByUser = new Map<string, { reason: string; suspendedAt: string }>();

  if (userIds.length > 0) {
    const [{ data: stats }, { data: txns }, { data: suspensions }] = await Promise.all([
      supabase.from("player_stats").select("user_id,current_rating,matches_total").in("user_id", userIds),
      supabase
        .from("transactions")
        .select("customer_user_id,amount_cents")
        .in("customer_user_id", userIds)
        .eq("status", "captured")
        .gte("created_at", monthStart.toISOString()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("user_suspensions")
        .select("user_id,reason,suspended_at")
        .in("user_id", userIds)
        .is("reactivated_at", null) as Promise<{ data: Array<{ user_id: string; reason: string; suspended_at: string }> | null }>,
    ]);

    for (const s of suspensions ?? []) {
      suspensionByUser.set(s.user_id as string, {
        reason: s.reason as string,
        suspendedAt: s.suspended_at as string,
      });
    }

    // Mejor rating por usuario (across sports) y suma de matches.
    for (const s of stats ?? []) {
      const uid = s.user_id as string;
      const r = s.current_rating as number;
      if (!ratingByUser.has(uid) || r > (ratingByUser.get(uid) ?? 0)) {
        ratingByUser.set(uid, r);
      }
      matchesByUser.set(uid, (matchesByUser.get(uid) ?? 0) + ((s.matches_total as number) ?? 0));
    }
    for (const t of txns ?? []) {
      const uid = t.customer_user_id as string;
      if (!uid) continue;
      spendByUser.set(uid, (spendByUser.get(uid) ?? 0) + ((t.amount_cents as number) ?? 0));
    }
  }

  const nowMs = Date.now();
  const rows: UserRow[] = (profiles ?? []).map((p) => {
    const id = p.id as string;
    const name = (p.display_name as string) ?? "Sin nombre";
    const elo = ratingByUser.get(id) ?? 1500;
    const spendCents = spendByUser.get(id) ?? 0;
    const tier = ((p.plan_tier as string) ?? "free") as "free" | "premium";
    const expires = (p.plan_expires_at as string | null) ?? null;
    const planActive =
      tier === "premium" && (expires == null || Date.parse(expires) > nowMs);
    const suspension = suspensionByUser.get(id);
    return {
      id,
      n: name,
      e: `@${(p.username as string) ?? "—"}`,
      l: Math.round((elo / 1000) * 10) / 10, // ELO 2500 → 2.5
      city: (p.city as string) ?? "—",
      m: matchesByUser.get(id) ?? 0,
      st: suspension ? "banned" : "active",
      av: initials(name),
      avBg: gradientFor(id),
      spend: `$${Math.round(spendCents / 100).toLocaleString("en-US")}`,
      avatarUrl: (p.avatar_url as string | null) ?? null,
      planTier: planActive ? "premium" : "free",
      planExpiresAt: expires,
      suspended: Boolean(suspension),
      suspensionReason: suspension?.reason ?? null,
      suspendedAt: suspension?.suspendedAt ?? null,
    };
  });

  return { rows, total: totalCount ?? rows.length };
}

export async function AdminUsersScreen() {
  const data = await loadData();
  return <AdminUsersScreenView data={data} />;
}
