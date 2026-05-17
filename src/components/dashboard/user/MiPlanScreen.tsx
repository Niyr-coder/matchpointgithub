// Server: trae plan vigente del user + historial de subscriptions.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getCurrentPlan } from "@/server/actions/player-subscriptions";
import {
  MiPlanScreenView,
  type PlanInfo,
  type PlanSubscriptionRow,
} from "./MiPlanScreenView";

async function loadData(): Promise<{
  plan: PlanInfo;
  history: PlanSubscriptionRow[];
}> {
  const fallback: PlanInfo = { tier: "free", expiresAt: null, active: true };

  const session = await getSession();
  if (!session.authenticated) {
    return { plan: fallback, history: [] };
  }
  const userId = session.session.userId;

  const planRes = await getCurrentPlan();
  const plan: PlanInfo = planRes.ok
    ? {
        tier: planRes.data.tier,
        expiresAt: planRes.data.expiresAt,
        active: planRes.data.active,
      }
    : fallback;

  const supabase = await getServerClient();
  const { data: rows } = await supabase
    .from("player_subscriptions")
    .select(
      "id,tier,status,starts_at,expires_at,duration_months,transaction_id,created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const history: PlanSubscriptionRow[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    tier: r.tier as string,
    status: r.status as string,
    startsAt: (r.starts_at as string | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
    durationMonths: (r.duration_months as number) ?? 1,
    transactionId: (r.transaction_id as string | null) ?? null,
    createdAt: r.created_at as string,
  }));

  return { plan, history };
}

export async function MiPlanScreen() {
  const data = await loadData();
  return <MiPlanScreenView {...data} />;
}
