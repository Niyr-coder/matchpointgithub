import "server-only";

import { overlapsRangeIso, parseRangeEnd, sportLabel } from "@/lib/reservations/during-range";

export type CourtOccupancyStatus = "free" | "busy" | "class";

export type CourtOccupancyRow = {
  id: string;
  n: string;
  sport: string;
  sportRaw: string;
  status: CourtOccupancyStatus;
  until: string;
};

export type CourtSportSummary = {
  sport: string;
  sportRaw: string;
  free: number;
  total: number;
};

export type CourtOccupancySnapshot = {
  courts: CourtOccupancyRow[];
  total: number;
  free: number;
  busy: number;
  classCount: number;
  bySport: CourtSportSummary[];
  /** Frase lista para decir en recepción. */
  answerLine: string;
};

/** Ocupación en vivo de todas las canchas activas del club. */
export async function loadCourtOccupancy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clubId: string,
): Promise<CourtOccupancySnapshot> {
  const now = new Date();

  const [{ data: courts }, { data: liveReservations }] = await Promise.all([
    supabase
      .from("courts")
      .select("id,code,name,sport")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("ordinal"),
    supabase
      .from("reservations")
      .select("court_id,during,source")
      .eq("club_id", clubId)
      .neq("status", "cancelled")
      .overlaps(
        "during",
        overlapsRangeIso(
          new Date(now.getTime() - 3 * 3600 * 1000),
          new Date(now.getTime() + 6 * 3600 * 1000),
        ),
      ),
  ]);

  const occupancy = new Map<string, { end: Date; source: string }>();
  for (const r of liveReservations ?? []) {
    const end = parseRangeEnd(r.during as string);
    if (!end || end < now) continue;
    const m = (r.during as string).match(/^[[(]"?([^",)]+)/);
    const start = m ? new Date(m[1]) : null;
    if (!start || start > now) continue;
    const courtId = r.court_id as string;
    const curr = occupancy.get(courtId);
    if (!curr || end > curr.end) {
      occupancy.set(courtId, { end, source: r.source as string });
    }
  }

  const courtList: CourtOccupancyRow[] = (courts ?? []).map((c: Record<string, unknown>) => {
    const occ = occupancy.get(c.id as string);
    const status: CourtOccupancyStatus = !occ ? "free" : occ.source === "class" ? "class" : "busy";
    const untilStr = occ
      ? `${String(occ.end.getHours()).padStart(2, "0")}:${String(occ.end.getMinutes()).padStart(2, "0")}`
      : "—";
    const sportRaw = c.sport as string;
    return {
      id: c.id as string,
      n: (c.name as string) ?? (c.code as string) ?? "Cancha",
      sport: sportLabel(sportRaw),
      sportRaw,
      status,
      until: untilStr,
    };
  });

  courtList.sort((a, b) => {
    const order = { free: 0, busy: 1, class: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return a.n.localeCompare(b.n, "es");
  });

  const free = courtList.filter((c) => c.status === "free").length;
  const busy = courtList.filter((c) => c.status === "busy").length;
  const classCount = courtList.filter((c) => c.status === "class").length;
  const total = courtList.length;

  const sportMap = new Map<string, CourtSportSummary>();
  for (const c of courtList) {
    const prev = sportMap.get(c.sportRaw) ?? {
      sport: c.sport,
      sportRaw: c.sportRaw,
      free: 0,
      total: 0,
    };
    prev.total += 1;
    if (c.status === "free") prev.free += 1;
    sportMap.set(c.sportRaw, prev);
  }
  const bySport = Array.from(sportMap.values()).sort((a, b) => b.free - a.free);

  let answerLine: string;
  if (total === 0) {
    answerLine = "No hay canchas activas configuradas en el club.";
  } else if (free === 0) {
    answerLine = `Ahora mismo las ${total} canchas están ocupadas.`;
  } else if (free === total) {
    answerLine = `Sí: las ${total} canchas están libres ahora.`;
  } else {
    const sportBits = bySport
      .filter((s) => s.free > 0)
      .map((s) => `${s.sport} ${s.free}/${s.total}`)
      .join(" · ");
    answerLine = `Sí: ${free} de ${total} canchas libres${sportBits ? ` (${sportBits})` : ""}.`;
  }

  return {
    courts: courtList,
    total,
    free,
    busy,
    classCount,
    bySport,
    answerLine,
  };
}
