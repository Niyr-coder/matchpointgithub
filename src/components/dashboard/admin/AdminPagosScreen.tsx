// Server: pagos & payouts globales para admin.
import { AuthError } from "@/lib/auth/session";
import { getAdminClient } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { getTakeRatePct } from "@/server/queries/platform-config";
import { listPendingProofsAdmin } from "@/server/actions/payment-proofs";
import {
  AdminPagosScreenView,
  type PagosData,
  type PendingProofView,
  type PendingPayoutView,
  type TxRow,
} from "./AdminPagosScreenView";

function relativeTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function mapKind(dbKind: string): "payout" | "reserve" | "refund" | "event" | "shop" {
  if (dbKind === "reservation") return "reserve";
  if (dbKind === "proshop_sale") return "shop";
  if (dbKind === "event" || dbKind === "tournament") return "event";
  return "reserve";
}

function mapStatus(dbStatus: string): "completed" | "pending" | "failed" {
  if (dbStatus === "captured") return "completed";
  if (dbStatus === "pending" || dbStatus === "authorized") return "pending";
  return "failed";
}

async function requireAdminUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Debes iniciar sesión");

  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere rol admin");
  return user.id;
}

async function loadData(): Promise<PagosData> {
  await requireAdminUserId();
  const supabase = getAdminClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const takeRatePct = await getTakeRatePct();
  const takeRate = takeRatePct / 100;

  const [
    { data: txns },
    { data: refunds },
    { data: clubsRows },
    { data: profilesRows },
    { data: partnersRows },
    payoutsRes,
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,kind,amount_cents,currency,status,created_at,club_id,customer_user_id,customer_name")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("refunds")
      .select("id,amount_cents,created_at,transaction_id")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("clubs").select("id,name"),
    supabase.from("profiles").select("id,display_name"),
    supabase.from("partner_orgs").select("id,name"),
    // payouts aún no está en los types generados.
    supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("payouts" as any)
      .select("id,club_id,partner_id,net_cents,currency,status")
      .in("status", ["pending", "processing"]),
  ]);
  type PayoutRow = {
    id: string;
    club_id: string | null;
    partner_id: string | null;
    net_cents: number;
    currency: string | null;
    status: string;
  };
  const pendingPayouts = (payoutsRes.data ?? []) as unknown as PayoutRow[];

  const clubName = new Map<string, string>();
  for (const c of clubsRows ?? []) clubName.set(c.id as string, c.name as string);
  const userName = new Map<string, string>();
  for (const p of profilesRows ?? []) userName.set(p.id as string, p.display_name as string);
  const partnerName = new Map<string, string>();
  for (const p of partnersRows ?? []) partnerName.set(p.id as string, p.name as string);

  // KPIs hoy
  let gmvTodayCents = 0;
  let commissionTodayCents = 0;
  let refundsTodayCents = 0;
  for (const t of txns ?? []) {
    const at = new Date(t.created_at as string);
    if (at >= todayStart && t.status === "captured") {
      const amt = (t.amount_cents as number) ?? 0;
      gmvTodayCents += amt;
      commissionTodayCents += Math.round(amt * takeRate);
    }
  }
  for (const r of refunds ?? []) {
    const at = new Date(r.created_at as string);
    if (at >= todayStart) refundsTodayCents += (r.amount_cents as number) ?? 0;
  }
  const refundsCountToday = (refunds ?? []).filter((r) => new Date(r.created_at as string) >= todayStart).length;

  // Rows: combinar tx + refunds. Las tx con status='refunded' o presentes en refunds → kind='refund'.
  const refundedTxIds = new Set((refunds ?? []).map((r) => r.transaction_id as string));

  const rows: TxRow[] = (txns ?? []).map((t) => {
    const rawStatus = t.status as string;
    const isRefund = rawStatus === "refunded" || refundedTxIds.has(t.id as string);
    const kind = isRefund ? "refund" : mapKind(t.kind as string);
    const whoFromClub = t.club_id ? clubName.get(t.club_id as string) : undefined;
    const whoFromUser = t.customer_user_id ? userName.get(t.customer_user_id as string) : undefined;
    const who = whoFromUser ?? whoFromClub ?? (t.customer_name as string | null) ?? "—";
    const amtCents = (t.amount_cents as number) ?? 0;
    const sign = isRefund ? "-" : "+";
    const transactionId = t.id as string;
    return {
      id: `TX-${transactionId.slice(0, 8).toUpperCase()}`,
      transactionId,
      who,
      kind,
      amt: `${sign}$${(amtCents / 100).toFixed(2)}`,
      amountCents: amtCents,
      currency: (t.currency as string | null) ?? "USD",
      when: relativeTime(t.created_at as string, now),
      st: mapStatus(rawStatus),
      rawStatus,
    };
  });

  const payoutsToProcessCents = pendingPayouts.reduce((s, p) => s + (p.net_cents ?? 0), 0);
  const payoutsClubCount = new Set(
    pendingPayouts.map((p) => p.club_id ?? p.partner_id).filter((x): x is string => !!x),
  ).size;
  const payoutRows: PendingPayoutView[] = pendingPayouts.map((p) => ({
    id: p.id,
    label: p.club_id
      ? clubName.get(p.club_id) ?? "Club"
      : p.partner_id
        ? partnerName.get(p.partner_id) ?? "Partner"
        : "Payout",
    amountCents: p.net_cents ?? 0,
    currency: p.currency ?? "USD",
    status: p.status,
  }));

  return {
    rows,
    payouts: payoutRows,
    kpis: {
      gmvTodayCents,
      payoutsToProcessCents,
      payoutsClubCount,
      commissionTodayCents,
      takeRatePct,
      refundsTodayCents,
      refundsCountToday,
    },
  };
}

async function loadPendingProofs(): Promise<PendingProofView[]> {
  const res = await listPendingProofsAdmin();
  if (!res.ok) return [];
  return res.data.map((r) => ({
    transactionId: r.transactionId,
    amountCents: r.amountCents,
    currency: r.currency,
    customerName: r.customerName,
    kind: r.kind,
    refLabel: r.refLabel,
    proofSignedUrl: r.proofSignedUrl,
    proofUrl: r.proofUrl,
    proofSubmittedAt: r.proofSubmittedAt,
  }));
}

export async function AdminPagosScreen() {
  const [data, pendingProofs] = await Promise.all([loadData(), loadPendingProofs()]);
  return <AdminPagosScreenView data={data} pendingProofs={pendingProofs} />;
}
