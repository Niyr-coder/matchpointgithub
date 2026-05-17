// Server: fetch club activo del manager + KPIs operativos + reservas hoy + walk-in queue + eventos.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { ManagerHomeView, type ManagerHomeData } from "./ManagerHomeView";

const MONTHS_ES = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];

function parseDuringStart(during: string): Date {
  const m = during.match(/^[[(]"?([^",)]+)/);
  return new Date(m?.[1] ?? during);
}
function parseDuringEnd(during: string): Date {
  const m = during.match(/[,]"?([^",)]+)"?[)\]]$/);
  return new Date(m?.[1] ?? during);
}

async function loadData(): Promise<ManagerHomeData> {
  const clubId = await resolveActiveClubId({ staffRoles: ["manager", "owner", "admin"] });
  if (!clubId) return emptyData();

  const supabase = await getServerClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    { data: club },
    { data: courts },
    { data: todayResv },
    { data: cashToday },
    { data: walkins },
    { data: events },
  ] = await Promise.all([
    supabase.from("clubs").select("id,name").eq("id", clubId).maybeSingle(),
    supabase
      .from("courts")
      .select("id,code,name")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("ordinal"),
    supabase
      .from("reservations")
      .select("id,court_id,during,status,source,sport,organizer_id,max_players")
      .eq("club_id", clubId)
      .gte("during", todayStart.toISOString())
      .lt("during", todayEnd.toISOString())
      .neq("status", "cancelled")
      .order("during", { ascending: true }),
    supabase
      .from("transactions")
      .select("amount_cents")
      .eq("club_id", clubId)
      .eq("status", "captured")
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("reservations")
      .select("id,organizer_id,sport,max_players,during,status")
      .eq("club_id", clubId)
      .eq("source", "walkin")
      .gte("during", todayStart.toISOString())
      .lt("during", todayEnd.toISOString())
      .in("status", ["booked", "confirmed"])
      .order("during", { ascending: true })
      .limit(5),
    supabase
      .from("events")
      .select("id,name,starts_at,kind")
      .eq("club_id", clubId)
      .gte("starts_at", new Date().toISOString())
      .not("status", "in", "(draft,cancelled)")
      .order("starts_at", { ascending: true })
      .limit(3),
  ]);

  // Resolve organizer names for today's reservations + walkins.
  const organizerIds = new Set<string>();
  for (const r of todayResv ?? []) organizerIds.add(r.organizer_id as string);
  for (const w of walkins ?? []) organizerIds.add(w.organizer_id as string);
  const idsArr = Array.from(organizerIds).filter(Boolean);
  const nameById = new Map<string, string>();
  if (idsArr.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", idsArr);
    for (const p of profs ?? []) {
      nameById.set(p.id as string, (p.display_name as string) ?? "Cliente");
    }
  }

  const courtLabelById = new Map<string, string>();
  for (const c of courts ?? []) {
    courtLabelById.set(
      c.id as string,
      ((c.code as string) ?? (c.name as string) ?? "C").slice(0, 6),
    );
  }

  // Reservas hoy: derivar estado + pago.
  const reservas = (todayResv ?? []).map((r) => {
    const start = parseDuringStart(r.during as string);
    const end = parseDuringEnd(r.during as string);
    const durMin = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
    const hh = String(start.getHours()).padStart(2, "0");
    const mm = String(start.getMinutes()).padStart(2, "0");

    const status = r.status as string;
    const source = r.source as string;
    let st = "PENDIENTE";
    let stColor = "#737373";
    if (source === "walkin") {
      st = "WALK-IN";
      stColor = "#dc2626";
    } else if (status === "confirmed") {
      st = "CONFIRMADA";
      stColor = "var(--primary)";
    } else if (status === "booked") {
      st = "RESERVADA";
      stColor = "var(--primary)";
    } else if (status === "checked_in") {
      st = "CHECK-IN";
      stColor = "#0ea5e9";
    } else if (status === "completed") {
      st = "JUGADA";
      stColor = "#0ea5e9";
    } else if (status === "no_show") {
      st = "NO-SHOW";
      stColor = "#dc2626";
    }

    return {
      t: `${hh}:${mm}`,
      n: nameById.get(r.organizer_id as string) ?? "Cliente",
      c: courtLabelById.get(r.court_id as string) ?? "—",
      d: durMin > 0 ? `${durMin}m` : "—",
      st,
      stColor,
      p: "—", // sin tracking de pago por reserva todavía
    };
  });

  // Walk-in queue (en cola: source=walkin, status=pending o booked y arranca hoy).
  const now = Date.now();
  const walkinQ = (walkins ?? []).map((w) => {
    const start = parseDuringStart(w.during as string);
    const mins = Math.max(0, Math.round((now - start.getTime()) / 60000));
    const sportLabel = sportEs(w.sport as string);
    return {
      n: nameById.get(w.organizer_id as string) ?? "Walk-in",
      t: mins > 0 ? `${mins}min` : "ahora",
      sport: sportLabel,
      players: (w.max_players as number) ?? 0,
    };
  });

  // Próximos eventos (3).
  const eventsOut = (events ?? []).map((e) => {
    const d = new Date(e.starts_at as string);
    return {
      d: String(d.getUTCDate()).padStart(2, "0"),
      m: MONTHS_ES[d.getUTCMonth()],
      name: (e.name as string) ?? "Evento",
      sub: eventKindLabel(e.kind as string),
    };
  });

  // KPIs
  const reservasHoyCount = reservas.length;
  const confirmadas = reservas.filter((r) => r.st === "CONFIRMADA").length;
  const pendientes = reservas.filter((r) => r.st === "PENDIENTE").length;
  const walkinsCount = walkinQ.length;
  const noShows = (todayResv ?? []).filter((r) => (r.status as string) === "no_show").length;
  const cajaCents = (cashToday ?? []).reduce(
    (s, t) => s + ((t.amount_cents as number) ?? 0),
    0,
  );

  return {
    clubId,
    clubName: (club?.name as string) ?? "Tu club",
    hasClub: true,
    reservasHoyCount,
    confirmadas,
    pendientes,
    walkinsCount,
    noShows,
    cajaCents,
    reservas,
    walkinQ,
    events: eventsOut,
  };
}

function emptyData(): ManagerHomeData {
  return {
    clubId: null,
    clubName: "Tu club",
    hasClub: false,
    reservasHoyCount: 0,
    confirmadas: 0,
    pendientes: 0,
    walkinsCount: 0,
    noShows: 0,
    cajaCents: 0,
    reservas: [],
    walkinQ: [],
    events: [],
  };
}

function sportEs(sport: string): string {
  switch (sport) {
    case "padel": return "Pádel";
    case "tennis": return "Tenis";
    case "pickleball": return "Pickleball";
    case "squash": return "Squash";
    default: return sport ? sport[0].toUpperCase() + sport.slice(1) : "—";
  }
}

function eventKindLabel(kind: string): string {
  switch (kind) {
    case "social": return "Social";
    case "clinic": return "Clínica";
    case "exhibition": return "Exhibición";
    case "party": return "Fiesta";
    case "league_meet": return "Liga";
    default: return "Evento";
  }
}

export async function ManagerHome() {
  const data = await loadData();
  return <ManagerHomeView data={data} />;
}
