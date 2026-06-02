// Server: home del empleado — KPIs del turno, próximos check-ins, caja del día.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { loadReceptionQueue } from "@/server/queries/reception-queue";
import { loadCourtOccupancy } from "@/server/queries/court-occupancy";
import { fmtHHMM } from "@/lib/reservations/during-range";
import { EmployeeHomeView, type EmployeeHomeData, type CashTileData } from "./EmployeeHomeView";

async function loadData(): Promise<EmployeeHomeData> {
  const session = await getSession();
  const clubId = await resolveActiveClubId();
  const userId = session.authenticated ? session.session.userId : null;
  const userName = userId
    ? await getProfileSummary(userId).then((p) => p.displayName ?? p.username ?? null)
    : null;

  if (!clubId) {
    return {
      clubId: null,
      clubName: "Tu club",
      userName,
      nextCheckins: [],
      cash: [
        { l: "Efectivo", v: "$—", i: "banknote" },
        { l: "Tarjeta", v: "$—", i: "credit-card", accent: true },
        { l: "Transferencia", v: "$—", i: "arrow-left-right" },
        { l: "Pendiente", v: "$—", i: "clock", warn: true },
      ],
      checkinsAttended: 0,
      walkinsHandled: 0,
      cashTotalLabel: "$—",
      openTickets: 0,
      shiftStartedLabel: null,
      pendingCheckins: 0,
      courts: null,
    };
  }

  const supabase = await getServerClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    { data: club },
    nextCheckins,
    { data: checkinsToday },
    { data: walkinsToday },
    { data: txnsToday },
    { count: openTickets },
    firstCheckinRes,
    courtsSnapshot,
  ] = await Promise.all([
    supabase.from("clubs").select("id,name").eq("id", clubId).maybeSingle(),
    loadReceptionQueue(supabase, clubId, { windowHours: 12, limit: 4 }),
    supabase
      .from("check_ins")
      .select("id,scanned_by,scanned_at")
      .eq("club_id", clubId)
      .gte("scanned_at", todayStart.toISOString()),
    supabase
      .from("walkins")
      .select("id,attended_by")
      .eq("club_id", clubId)
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("transactions")
      .select("amount_cents,method,status,created_by")
      .eq("club_id", clubId)
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .in("status", ["open", "in_progress"]),
    userId
      ? supabase
          .from("check_ins")
          .select("scanned_at")
          .eq("club_id", clubId)
          .eq("scanned_by", userId)
          .gte("scanned_at", todayStart.toISOString())
          .order("scanned_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    loadCourtOccupancy(supabase, clubId),
  ]);

  const totals = { cash: 0, card: 0, transfer: 0, pending: 0 };
  for (const t of txnsToday ?? []) {
    const amt = (t.amount_cents as number) ?? 0;
    const status = t.status as string;
    const method = t.method as string;
    if (status === "pending" || status === "authorized") {
      totals.pending += amt;
      continue;
    }
    if (status !== "captured") continue;
    if (method === "cash") totals.cash += amt;
    else if (method === "card") totals.card += amt;
    else if (method === "transfer") totals.transfer += amt;
  }
  const dollars = (c: number) => `$${Math.round(c / 100)}`;
  const cash: CashTileData[] = [
    { l: "Efectivo", v: dollars(totals.cash), i: "banknote" },
    { l: "Tarjeta", v: dollars(totals.card), i: "credit-card", accent: true },
    { l: "Transferencia", v: dollars(totals.transfer), i: "arrow-left-right" },
    { l: "Pendiente", v: dollars(totals.pending), i: "clock", warn: true },
  ];

  const checkinsAttended = userId
    ? (checkinsToday ?? []).filter((c) => c.scanned_by === userId).length
    : 0;
  const walkinsHandled = userId
    ? (walkinsToday ?? []).filter((w) => w.attended_by === userId).length
    : 0;
  const cashTotalCents = totals.cash + totals.card + totals.transfer;

  const firstAt = firstCheckinRes.data?.scanned_at as string | undefined;
  const shiftStartedLabel = firstAt
    ? `Desde ${fmtHHMM(new Date(firstAt))} hoy`
    : checkinsAttended > 0
      ? "Activo hoy"
      : null;

  return {
    clubId,
    clubName: (club?.name as string) ?? "Tu club",
    userName,
    nextCheckins,
    cash,
    checkinsAttended,
    walkinsHandled,
    cashTotalLabel: dollars(cashTotalCents),
    openTickets: openTickets ?? 0,
    shiftStartedLabel,
    pendingCheckins: nextCheckins.length,
    courts: courtsSnapshot,
  };
}

export async function EmployeeHome() {
  const data = await loadData();
  return <EmployeeHomeView data={data} />;
}
