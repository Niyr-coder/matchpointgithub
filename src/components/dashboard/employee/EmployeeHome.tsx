// Server: home del empleado — KPIs del turno, próximos check-ins, caja del día.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { getSession } from "@/lib/auth/session";
import { EmployeeHomeView, type EmployeeHomeData, type CheckinRow, type CashTileData } from "./EmployeeHomeView";

function parseRangeStart(during: string): Date | null {
  const m = during.match(/^[[(]"?([^",)]+)/);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d;
}

function fmtHHMM(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function sportLabel(s: string): string {
  if (s === "padel") return "Pádel";
  if (s === "pickleball" || s === "pickle") return "Pickle";
  if (s === "tennis") return "Tenis";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function loadData(): Promise<EmployeeHomeData> {
  const session = await getSession();
  const clubId = await resolveActiveClubId();
  const userId = session.authenticated ? session.session.userId : null;

  if (!clubId) {
    return {
      clubId: null,
      clubName: "Tu club",
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
    };
  }

  const supabase = await getServerClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const [{ data: club }, { data: reservations }, { data: checkinsToday }, { data: walkinsToday }, { data: txnsToday }] =
    await Promise.all([
      supabase.from("clubs").select("id,name").eq("id", clubId).maybeSingle(),
      supabase
        .from("reservations")
        .select("id,during,sport,court_id,organizer_id,max_players,courts(code,name)")
        .eq("club_id", clubId)
        .gte("during", now.toISOString())
        .lt("during", tomorrowStart.toISOString())
        .neq("status", "cancelled")
        .limit(20),
      supabase
        .from("check_ins")
        .select("id,scanned_by")
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
    ]);

  // Próximos 4 check-ins — orderar por start del during.
  const reservationsAsc = (reservations ?? [])
    .map((r) => {
      const start = parseRangeStart(r.during as string);
      return { r, start };
    })
    .filter((x): x is { r: NonNullable<typeof reservations>[number]; start: Date } => !!x.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 4);

  // Lookup organizer names.
  const organizerIds = Array.from(
    new Set(reservationsAsc.map((x) => x.r.organizer_id as string).filter(Boolean)),
  );
  const profNames = new Map<string, string>();
  if (organizerIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", organizerIds);
    for (const p of profs ?? []) profNames.set(p.id as string, p.display_name as string);
  }

  const nextCheckins: CheckinRow[] = reservationsAsc.map((x) => {
    const court = x.r.courts as { code?: string; name?: string } | null;
    const courtLabel = (court?.code ?? court?.name ?? "—").slice(0, 4);
    const startMs = x.start.getTime();
    const diffMin = Math.round((startMs - now.getTime()) / 60000);
    const st: CheckinRow["st"] = diffMin <= 15 ? "arriving" : "on-time";
    return {
      id: x.r.id as string,
      t: fmtHHMM(x.start),
      n: profNames.get(x.r.organizer_id as string) ?? "Cliente",
      c: courtLabel,
      d: "—",
      sport: sportLabel(x.r.sport as string),
      code: `RV-${(x.r.id as string).slice(0, 4).toUpperCase()}`,
      st,
    };
  });

  // Caja del día: agregados por método.
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

  // KPIs propios del empleado (cuando se puede atribuir).
  const checkinsAttended = userId
    ? (checkinsToday ?? []).filter((c) => c.scanned_by === userId).length
    : 0;
  const walkinsHandled = userId
    ? (walkinsToday ?? []).filter((w) => w.attended_by === userId).length
    : 0;
  const cashTotalCents = totals.cash + totals.card + totals.transfer;

  return {
    clubId,
    clubName: (club?.name as string) ?? "Tu club",
    nextCheckins,
    cash,
    checkinsAttended,
    walkinsHandled,
    cashTotalLabel: dollars(cashTotalCents),
  };
}

export async function EmployeeHome() {
  const data = await loadData();
  return <EmployeeHomeView data={data} />;
}
