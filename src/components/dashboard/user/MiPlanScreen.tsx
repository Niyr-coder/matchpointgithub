// Server: trae plan vigente del user + historial de subscriptions.
import { Suspense } from "react";
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary, isPlanActive } from "@/lib/auth/profile";
import {
  MiPlanScreenView,
  type PlanInfo,
  type PlanSubscriptionRow,
} from "./MiPlanScreenView";

async function loadData(): Promise<{
  plan: PlanInfo;
  history: PlanSubscriptionRow[];
}> {
  const session = await getSession();
  if (!session.authenticated) {
    const fallback: PlanInfo = { tier: "free", expiresAt: null, active: true };
    return { plan: fallback, history: [] };
  }
  const userId = session.session.userId;

  // Antes esto llamaba getCurrentPlan(), que hace otro select a profiles.
  // getProfileSummary ya trae plan_tier + plan_expires_at y está cacheado por
  // request, así que evitamos el roundtrip si otro layer ya lo pidió.
  const summary = await getProfileSummary(userId);
  const { tier, active } = isPlanActive(summary);
  const plan: PlanInfo = {
    tier,
    expiresAt: summary.planExpiresAt,
    active,
  };
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
  return (
    <Suspense
      fallback={
        <div className="card" style={{ padding: 24, color: "var(--muted-fg)", fontSize: 13 }}>
          Cargando tu plan…
        </div>
      }
    >
      <MiPlanScreenView {...data} />
    </Suspense>
  );
}
