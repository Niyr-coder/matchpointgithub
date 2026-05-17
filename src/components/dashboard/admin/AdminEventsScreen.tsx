// Server: eventos + tournaments globales para admin.
import { getServerClient } from "@/lib/db/client.server";
import { AdminEventsScreenView, type EventsData, type EvRow, type EvStatus } from "./AdminEventsScreenView";

const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
};

function fmtDateRange(starts: Date, ends: Date | null): string {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  if (!ends || (starts.getMonth() === ends.getMonth() && starts.getDate() === ends.getDate())) {
    return `${starts.getDate()} ${months[starts.getMonth()]}`;
  }
  if (starts.getMonth() === ends.getMonth()) {
    return `${starts.getDate()}-${ends.getDate()} ${months[starts.getMonth()]}`;
  }
  return `${months[starts.getMonth()]}-${months[ends.getMonth()]}`;
}

function mapStatus(dbStatus: string, starts: Date, now: Date, full: boolean): EvStatus {
  if (full) return "LLENO";
  if (dbStatus === "live") return "EN VIVO";
  if (now >= starts && (dbStatus === "registration_closed" || dbStatus === "live")) return "EN CURSO";
  if (dbStatus === "registration_open") return "ABIERTO";
  if (dbStatus === "published") return "ABIERTO";
  return "ABIERTO";
}

async function loadData(): Promise<EventsData> {
  const supabase = await getServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [{ data: events }, { data: tournaments }, { data: clubsRows }, { data: txns }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id,name,kind,starts_at,ends_at,capacity,status,club_id,price_cents")
        .not("status", "in", "(finished,cancelled)")
        .order("starts_at", { ascending: true }),
      supabase
        .from("tournaments")
        .select("id,name,sport,starts_at,ends_at,max_participants,status,club_id,prize_pool_cents")
        .not("status", "in", "(finished,cancelled)")
        .order("starts_at", { ascending: true }),
      supabase.from("clubs").select("id,name"),
      supabase
        .from("transactions")
        .select("amount_cents,kind,created_at,status")
        .in("kind", ["event", "tournament"])
        .eq("status", "captured")
        .gte("created_at", monthStart.toISOString()),
    ]);

  const clubName = new Map<string, string>();
  for (const c of clubsRows ?? []) clubName.set(c.id as string, c.name as string);

  // Conteo inscritos para eventos y tournaments
  const evIds = (events ?? []).map((e) => e.id as string);
  const trIds = (tournaments ?? []).map((t) => t.id as string);
  const evRegByEvent = new Map<string, number>();
  const trRegByTournament = new Map<string, number>();

  if (evIds.length > 0) {
    const { data: regs } = await supabase
      .from("event_registrations")
      .select("event_id")
      .in("event_id", evIds)
      .in("status", ["registered", "attended"]);
    for (const r of regs ?? []) {
      const eid = r.event_id as string;
      evRegByEvent.set(eid, (evRegByEvent.get(eid) ?? 0) + 1);
    }
  }
  if (trIds.length > 0) {
    const { data: regs } = await supabase
      .from("registrations")
      .select("tournament_id")
      .in("tournament_id", trIds)
      .in("status", ["accepted", "pending"]);
    for (const r of regs ?? []) {
      const tid = r.tournament_id as string;
      trRegByTournament.set(tid, (trRegByTournament.get(tid) ?? 0) + 1);
    }
  }

  type LocalRow = EvRow & { startsAt: Date };
  const evRows: LocalRow[] = (events ?? []).map((e) => {
    const starts = new Date(e.starts_at as string);
    const ends = e.ends_at ? new Date(e.ends_at as string) : null;
    const insc = evRegByEvent.get(e.id as string) ?? 0;
    const cap = (e.capacity as number | null) ?? null;
    const full = cap != null && insc >= cap;
    const orgName = e.club_id ? clubName.get(e.club_id as string) ?? "—" : "MatchPoint";
    return {
      id: `ev-${e.id as string}`,
      n: (e.name as string) ?? "Evento",
      org: orgName,
      sport: ((e.kind as string) ?? "—").charAt(0).toUpperCase() + ((e.kind as string) ?? "").slice(1),
      date: fmtDateRange(starts, ends),
      insc: `${insc}/${cap ?? "∞"}`,
      prize: "—",
      st: mapStatus(e.status as string, starts, now, full),
      startsAt: starts,
    };
  });

  const trRows: LocalRow[] = (tournaments ?? []).map((t) => {
    const starts = new Date(t.starts_at as string);
    const ends = t.ends_at ? new Date(t.ends_at as string) : null;
    const insc = trRegByTournament.get(t.id as string) ?? 0;
    const cap = (t.max_participants as number | null) ?? null;
    const full = cap != null && insc >= cap;
    const orgName = t.club_id ? clubName.get(t.club_id as string) ?? "MatchPoint Pro Series" : "MatchPoint Pro Series";
    const prizeCents = (t.prize_pool_cents as number | null) ?? null;
    return {
      id: `tr-${t.id as string}`,
      n: (t.name as string) ?? "Torneo",
      org: orgName,
      sport: SPORT_LABEL[(t.sport as string) ?? ""] ?? (t.sport as string) ?? "—",
      date: fmtDateRange(starts, ends),
      insc: `${insc}/${cap ?? "∞"}`,
      prize: prizeCents != null ? `$${Math.round(prizeCents / 100).toLocaleString("en-US")}` : "—",
      st: mapStatus(t.status as string, starts, now, full),
      startsAt: starts,
    };
  });

  const rows = [...evRows, ...trRows].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const totalCount = rows.length;
  const activeCount = rows.filter((r) => r.st === "EN VIVO" || r.st === "EN CURSO" || r.st === "ABIERTO").length;
  const thisWeekCount = rows.filter((r) => r.startsAt >= now && r.startsAt < weekEnd).length;
  const revenueMonthCents = (txns ?? []).reduce((s, t) => s + ((t.amount_cents as number) ?? 0), 0);

  return {
    rows: rows.map(({ startsAt: _s, ...rest }) => rest),
    kpis: { totalCount, activeCount, thisWeekCount, revenueMonthCents },
  };
}

export async function AdminEventsScreen() {
  const data = await loadData();
  return <AdminEventsScreenView data={data} />;
}
