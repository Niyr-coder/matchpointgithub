// Server: caja del día (transacciones + KPIs por método + reembolsos).
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { EmployeeCajaScreenView, type CajaData, type Tx, type CajaKpis } from "./EmployeeCajaScreenView";

function fmtHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function methodMap(m: string): "card" | "cash" | "transfer" {
  if (m === "cash") return "cash";
  if (m === "transfer") return "transfer";
  return "card";
}

function conceptLabel(kind: string): string {
  if (kind === "reservation") return "Reserva de cancha";
  if (kind === "class") return "Clase";
  if (kind === "proshop_sale") return "Pro shop";
  if (kind === "event") return "Evento";
  if (kind === "tournament") return "Torneo";
  return "Cobro";
}

async function loadData(): Promise<CajaData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) {
    return {
      clubId: null,
      txs: [],
      kpis: { cashCents: 0, cashCount: 0, cardCents: 0, cardCount: 0, transferCents: 0, transferCount: 0, refundsCents: 0, refundsCount: 0 },
      totalLabel: "$—",
    };
  }

  const supabase = await getServerClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [{ data: txns }, { data: refundsRows }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,created_at,amount_cents,method,status,kind,customer_name,customer_user_id")
      .eq("club_id", clubId)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("refunds")
      .select("id,amount_cents,created_at,transaction_id,transactions!inner(club_id,method)")
      .eq("transactions.club_id", clubId)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Lookup customer names.
  const userIds = Array.from(
    new Set((txns ?? []).map((t) => t.customer_user_id as string).filter(Boolean)),
  );
  const userName = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id,display_name").in("id", userIds);
    for (const p of profs ?? []) userName.set(p.id as string, p.display_name as string);
  }

  const refundedTxIds = new Set((refundsRows ?? []).map((r) => r.transaction_id as string));
  const refundCentsByTx = new Map<string, number>();
  for (const r of refundsRows ?? []) {
    refundCentsByTx.set(r.transaction_id as string, (r.amount_cents as number) ?? 0);
  }

  const txs: Tx[] = (txns ?? []).map((t) => {
    const isRefund = refundedTxIds.has(t.id as string);
    const baseAmt = (t.amount_cents as number) ?? 0;
    const amt = isRefund ? -(refundCentsByTx.get(t.id as string) ?? baseAmt) / 100 : baseAmt / 100;
    return {
      id: t.id as string,
      t: fmtHHMM(new Date(t.created_at as string)),
      who:
        userName.get(t.customer_user_id as string) ??
        (t.customer_name as string | null) ??
        "—",
      concept: conceptLabel(t.kind as string) + (isRefund ? " · refund" : ""),
      method: methodMap(t.method as string),
      amt,
    };
  });

  // KPIs hoy.
  const kpis: CajaKpis = {
    cashCents: 0,
    cashCount: 0,
    cardCents: 0,
    cardCount: 0,
    transferCents: 0,
    transferCount: 0,
    refundsCents: 0,
    refundsCount: 0,
  };
  for (const t of txns ?? []) {
    if (t.status !== "captured") continue;
    if (refundedTxIds.has(t.id as string)) continue;
    const cents = (t.amount_cents as number) ?? 0;
    const m = t.method as string;
    if (m === "cash") {
      kpis.cashCents += cents;
      kpis.cashCount += 1;
    } else if (m === "transfer") {
      kpis.transferCents += cents;
      kpis.transferCount += 1;
    } else {
      kpis.cardCents += cents;
      kpis.cardCount += 1;
    }
  }
  for (const r of refundsRows ?? []) {
    kpis.refundsCents += (r.amount_cents as number) ?? 0;
    kpis.refundsCount += 1;
  }

  const totalCents = kpis.cashCents + kpis.cardCents + kpis.transferCents - kpis.refundsCents;
  const totalLabel = `$${Math.round(totalCents / 100)}`;

  return { clubId, txs, kpis, totalLabel };
}

export async function EmployeeCajaScreen() {
  const data = await loadData();
  return <EmployeeCajaScreenView data={data} />;
}
