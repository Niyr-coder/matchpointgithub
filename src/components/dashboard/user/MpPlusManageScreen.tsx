// Server loader del management view de MATCHPOINT+ (solo se renderiza
// cuando el user ya tiene un plan activo; el dispatch vive en
// MatchPointPlusScreen.tsx). Carga la sub activa, el histórico de cobros
// del plan, y los KPIs (días restantes, cobrado total, renovación sugerida).
import { getServerClient } from "@/lib/db/client.server";
import { redirect } from "next/navigation";
import { MpPlusManageView, type MpPlusManageData } from "./MpPlusManageView";

const PREMIUM_PRICE_CENTS_PER_MONTH = 699;

function methodLabel(method: string | null): string {
  switch (method) {
    case "transfer": return "Transferencia";
    case "cash": return "Efectivo";
    case "deuna": return "DeUna";
    default: return method ?? "—";
  }
}

export async function MpPlusManageScreen() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?auth=signin&next=/dashboard/user/mp-plus");

  const data = await loadData(supabase, user.id);
  return <MpPlusManageView data={data} />;
}

async function loadData(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  userId: string,
): Promise<MpPlusManageData> {
  const [{ data: profile }, { data: activeSub }, { data: txns }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name,plan_tier,plan_expires_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("player_subscriptions")
      .select("id,tier,status,starts_at,expires_at,duration_months,created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select("id,amount_cents,method,status,created_at")
      .eq("customer_user_id", userId)
      .eq("kind", "plan")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const expiresAtIso = (profile?.plan_expires_at as string | null) ?? null;
  const expiresAt = expiresAtIso ? new Date(expiresAtIso) : null;
  const now = new Date();
  const daysRemaining = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000))
    : 0;
  const cycleStartIso = (activeSub?.starts_at as string | null) ?? null;
  const cycleStart = cycleStartIso ? new Date(cycleStartIso) : null;
  const cycleDays = cycleStart && expiresAt
    ? Math.max(1, Math.round((expiresAt.getTime() - cycleStart.getTime()) / 86400000))
    : 30;

  const capturedTxns = (txns ?? []).filter((t) => (t.status as string) === "captured");
  const totalPaidCents = capturedTxns.reduce(
    (s, t) => s + ((t.amount_cents as number) ?? 0),
    0,
  );

  // Renovación sugerida: no implica cobro automático; solo calcula el monto
  // para crear otro comprobante manual por la misma duración.
  const durationMonths = (activeSub?.duration_months as number | null) ?? 1;
  const nextChargeCents = PREMIUM_PRICE_CENTS_PER_MONTH * durationMonths;

  // Método más reciente usado
  const lastMethod = txns?.[0]?.method as string | null;
  const methodHuman = methodLabel(lastMethod);

  return {
    userId,
    displayName: (profile?.display_name as string | null) ?? "",
    planTier: (profile?.plan_tier as string | null) ?? "free",
    expiresAtIso,
    daysRemaining,
    cycleDays,
    cycleStartIso,
    activeSubscription: activeSub
      ? {
          id: activeSub.id as string,
          startsAtIso: cycleStartIso,
          expiresAtIso: (activeSub.expires_at as string | null) ?? null,
          durationMonths,
        }
      : null,
    totalPaidCents,
    cyclesCompleted: capturedTxns.length,
    nextChargeCents,
    paymentMethod: methodHuman,
    history: (txns ?? []).map((t) => ({
      id: t.id as string,
      createdAtIso: t.created_at as string,
      amountCents: (t.amount_cents as number) ?? 0,
      method: methodLabel(t.method as string | null),
      status: (t.status as string) ?? "",
    })),
  };
}
