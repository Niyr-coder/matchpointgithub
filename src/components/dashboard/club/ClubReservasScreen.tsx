// Server: fetch club + courts + reservas de la semana actual.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { ClubReservasScreenView, type ReservasData } from "./ClubReservasScreenView";
// Grid alineado a la convención de booking (09:00–22:00, cada hora).
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
const DAYS_LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

function startOfWeek(d: Date): Date {
  const day = d.getDay() || 7;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (day - 1));
  return monday;
}

function fmtWeekRange(start: Date): string {
  const monthsShort = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()} – ${end.getDate()} ${monthsShort[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `${start.getDate()} ${monthsShort[start.getMonth()]} – ${end.getDate()} ${monthsShort[end.getMonth()]} ${start.getFullYear()}`;
}

function dayLabelsForWeek(start: Date): string[] {
  return DAYS_LABELS.map((d, i) => {
    const x = new Date(start);
    x.setDate(x.getDate() + i);
    return `${d} ${x.getDate()}`;
  });
}

function emptyGrid(): number[][] {
  return Array(7).fill(null).map(() => Array(HOURS.length).fill(0));
}

async function loadData(): Promise<ReservasData> {
  const clubId = await resolveActiveClubId();
  const weekStart = startOfWeek(new Date());
  const weekRangeLabel = fmtWeekRange(weekStart);
  const daysLabels = dayLabelsForWeek(weekStart);

  if (!clubId) {
    return {
      clubId: null,
      clubName: "Tu club",
      courts: [],
      weekRangeLabel,
      daysLabels,
      weekStartIso: weekStart.toISOString(),
      occupancyPct: 0,
      minPriceCents: null,
    };
  }

  const supabase = await getServerClient();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [{ data: club }, { data: courts }] = await Promise.all([
    supabase.from("clubs").select("id,name,timezone").eq("id", clubId).maybeSingle(),
    supabase
      .from("courts")
      .select("id,code,name,sport")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("ordinal"),
  ]);

  const courtList = (courts ?? []).map((c) => ({
    id: c.id as string,
    label: ((c.code as string) ?? (c.name as string) ?? "Cancha").slice(0, 12),
    sport: c.sport as "pickleball" | "padel" | "tennis",
  }));

  if (courtList.length === 0) {
    return {
      clubId,
      clubName: (club?.name as string) ?? "Tu club",
      courts: [],
      weekRangeLabel,
      daysLabels,
      weekStartIso: weekStart.toISOString(),
      occupancyPct: 0,
      minPriceCents: null,
    };
  }

  const courtIds = courtList.map((c) => c.id);

  const [{ data: reservations, error: resvErr }, { data: pricing }] = await Promise.all([
    // `during` es tstzrange — filtrar con `&&` (overlap), no `gte/lt` (que
    // parsea el timestamp como range literal y rompe con "malformed range").
    supabase
      .from("reservations")
      .select("id,court_id,during,status,kind,notes,organizer_id,for_user_id")
      .eq("club_id", clubId)
      .in("court_id", courtIds)
      .overlaps(
        "during",
        `[${weekStart.toISOString()},${weekEnd.toISOString()})`,
      )
      .neq("status", "cancelled"),
    supabase
      .from("court_pricing")
      .select("court_id,price_cents")
      .in("court_id", courtIds)
      .eq("active", true),
  ]);
  if (resvErr) {
    // Supabase errors a veces stringifian a "{}". Mostramos las props manualmente.
    console.error("[ClubReservasScreen] reservations query failed:", {
      message: resvErr.message,
      code: resvErr.code,
      details: resvErr.details,
      hint: resvErr.hint,
    });
  }

  // Resolver nombres en una sola query separada (fan-in de organizer/for_user
  // ids únicos). Las RLS de profiles permiten select público de displays.
  const userIds = new Set<string>();
  for (const r of reservations ?? []) {
    if (r.organizer_id) userIds.add(r.organizer_id as string);
    if (r.for_user_id) userIds.add(r.for_user_id as string);
  }
  const nameById = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", [...userIds]);
    for (const p of profs ?? []) {
      nameById.set(p.id as string, (p.display_name as string | null) ?? "Reserva");
    }
  }

  // Min price por cancha (no global) — el cell "+ $X" refleja el precio real.
  const priceByCourt = new Map<string, number>();
  for (const p of pricing ?? []) {
    const cId = p.court_id as string;
    const cents = p.price_cents as number;
    if (!priceByCourt.has(cId) || cents < (priceByCourt.get(cId) ?? Infinity)) {
      priceByCourt.set(cId, cents);
    }
  }
  const globalMin =
    pricing && pricing.length > 0
      ? Math.min(...pricing.map((p) => p.price_cents as number))
      : null;

  // Build per-court grids 7×HOURS.length (Mon..Sun × HOURS).
  const grids = new Map<string, number[][]>();
  // Meta paralelo: nombre del cliente + kind por celda, keyed por "${day}-${hour}".
  // Permite hover tooltip en el grid sin tener que re-fetch.
  type CellMeta = { name: string; kind: string; id: string };
  const metas = new Map<string, Record<string, CellMeta>>();
  for (const id of courtIds) {
    grids.set(id, emptyGrid());
    metas.set(id, {});
  }

  // Tz del club — usamos Intl para extraer hora y día en la zona horaria
  // local del club (no la del server). Bug previo: el server corre en UTC,
  // d.getHours() devolvía 14 en vez de 9 para una reserva Quito 09:00 → la
  // reserva caía en la celda equivocada del grid.
  const clubTz = (club?.timezone as string | null) ?? "UTC";
  const hourFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: clubTz,
    hour: "numeric",
    hour12: false,
  });
  const dayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: clubTz,
    weekday: "short",
  });
  const dayMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };

  // Helper: extrae start y end del tstzrange "["2026-05-23 14:00:00+00","...")"
  const parseRange = (raw: string): { start: Date; end: Date } | null => {
    const m = raw.match(/^[[(]"?([^",)]+)"?,"?([^",)]+)"?[\])]/);
    if (!m) return null;
    const norm = (s: string) =>
      s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
    const start = new Date(norm(m[1]));
    const end = new Date(norm(m[2]));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return { start, end };
  };

  let occupied = 0;
  for (const r of reservations ?? []) {
    const range = parseRange(r.during as string);
    if (!range) {
      console.warn("[ClubReservasScreen] could not parse reservation range", r.during);
      continue;
    }
    const dayName = dayFmt.format(range.start);
    const dayIdx = dayMap[dayName] ?? -1;
    if (dayIdx < 0) continue;
    const startH = parseInt(hourFmt.format(range.start), 10);
    const endH = parseInt(hourFmt.format(range.end), 10);
    if (Number.isNaN(startH) || Number.isNaN(endH)) continue;
    const grid = grids.get(r.court_id as string);
    if (!grid) continue;
    // kind (mig 167): booking → 1, event → 2, class → 3.
    const kind = (r.kind as string | null) ?? "booking";
    const stateVal = kind === "event" ? 2 : kind === "class" ? 3 : 1;
    // Nombre: prioriza for_user → organizer → notes (walk-in).
    let name =
      (r.for_user_id && nameById.get(r.for_user_id as string)) ??
      (r.organizer_id && nameById.get(r.organizer_id as string)) ??
      "Reserva";
    if (!r.for_user_id && r.notes) {
      const fromNotes = (r.notes as string).split(" · ")[0]?.trim();
      if (fromNotes) name = fromNotes;
    }
    const metaCourt = metas.get(r.court_id as string) ?? {};
    // Pintar TODAS las horas del rango [startH, endH). Si una reserva es
    // 19:00-21:00 (endH=21), pinta horas 19 y 20. Si endH cae justo al inicio
    // de una hora del grid (ej 19:00-21:00 = 21 exacto), no pinta la 21.
    // Si la reserva cae fuera del rango visible (09-22), recorta.
    const fromH = Math.max(startH, HOURS[0]);
    const toH = Math.min(endH, HOURS[HOURS.length - 1] + 1); // +1 porque rango es exclusivo
    for (let h = fromH; h < toH; h++) {
      const hourIdx = HOURS.indexOf(h);
      if (hourIdx < 0) continue;
      grid[dayIdx][hourIdx] = stateVal;
      metaCourt[`${dayIdx}-${hourIdx}`] = { name, kind, id: r.id as string };
      occupied++;
    }
    metas.set(r.court_id as string, metaCourt);
  }

  const totalCells = courtIds.length * 7 * HOURS.length;
  const occupancyPct = totalCells > 0 ? Math.round((occupied / totalCells) * 100) : 0;

  return {
    clubId,
    clubName: (club?.name as string) ?? "Tu club",
    courts: courtList.map((c) => ({
      ...c,
      grid: grids.get(c.id) ?? emptyGrid(),
      cellMeta: metas.get(c.id) ?? {},
      minPriceCents: priceByCourt.get(c.id) ?? globalMin,
    })),
    weekRangeLabel,
    daysLabels,
    weekStartIso: weekStart.toISOString(),
    occupancyPct,
    minPriceCents: globalMin,
  };
}

export async function ClubReservasScreen({
  showReceptionHourHint = false,
}: {
  showReceptionHourHint?: boolean;
} = {}) {
  const data = await loadData();
  return <ClubReservasScreenView data={data} showReceptionHourHint={showReceptionHourHint} />;
}
