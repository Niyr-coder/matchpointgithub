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
  return Array(7).fill(null).map(() => Array(8).fill(0));
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
      occupancyPct: 0,
      minPriceCents: null,
    };
  }

  const supabase = await getServerClient();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [{ data: club }, { data: courts }] = await Promise.all([
    supabase.from("clubs").select("id,name").eq("id", clubId).maybeSingle(),
    supabase
      .from("courts")
      .select("id,code,name")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("ordinal"),
  ]);

  const courtList = (courts ?? []).map((c) => ({
    id: c.id as string,
    label: ((c.code as string) ?? (c.name as string) ?? "Cancha").slice(0, 12),
  }));

  if (courtList.length === 0) {
    return {
      clubId,
      clubName: (club?.name as string) ?? "Tu club",
      courts: [],
      weekRangeLabel,
      daysLabels,
      occupancyPct: 0,
      minPriceCents: null,
    };
  }

  const courtIds = courtList.map((c) => c.id);

  const [{ data: reservations }, { data: pricing }] = await Promise.all([
    supabase
      .from("reservations")
      .select("court_id,during,status")
      .eq("club_id", clubId)
      .in("court_id", courtIds)
      .gte("during", weekStart.toISOString())
      .lt("during", weekEnd.toISOString())
      .neq("status", "cancelled"),
    supabase
      .from("court_pricing")
      .select("court_id,price_cents")
      .in("court_id", courtIds)
      .eq("active", true),
  ]);

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

  // Build per-court grids 7×8 (Mon..Sun × HOURS).
  const grids = new Map<string, number[][]>();
  for (const id of courtIds) grids.set(id, emptyGrid());

  let occupied = 0;
  for (const r of reservations ?? []) {
    const startStr = ((r.during as string).match(/^[[(]"?([^",)]+)/)?.[1]) ?? (r.during as string);
    const d = new Date(startStr);
    const dayIdx = (d.getDay() || 7) - 1;
    const h = d.getHours();
    // Bucket a la hora del grid más cercana.
    let hourIdx = -1;
    let minDiff = 99;
    for (let i = 0; i < HOURS.length; i++) {
      const diff = Math.abs(h - HOURS[i]);
      if (diff < minDiff) {
        minDiff = diff;
        hourIdx = i;
      }
    }
    if (hourIdx < 0 || dayIdx < 0 || dayIdx > 6) continue;
    const grid = grids.get(r.court_id as string);
    if (!grid) continue;
    grid[dayIdx][hourIdx] = 1; // reserved
    occupied++;
  }

  const totalCells = courtIds.length * 7 * HOURS.length;
  const occupancyPct = totalCells > 0 ? Math.round((occupied / totalCells) * 100) : 0;

  return {
    clubId,
    clubName: (club?.name as string) ?? "Tu club",
    courts: courtList.map((c) => ({
      ...c,
      grid: grids.get(c.id) ?? emptyGrid(),
      minPriceCents: priceByCourt.get(c.id) ?? globalMin,
    })),
    weekRangeLabel,
    daysLabels,
    occupancyPct,
    minPriceCents: globalMin,
  };
}

export async function ClubReservasScreen() {
  const data = await loadData();
  return <ClubReservasScreenView data={data} />;
}
