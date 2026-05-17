// Server: reportes operativos del club — ocupación (heatmap + KPI), distribución
// por deporte, top socios, no-shows. NPS y tiempo de atención no tienen tracking
// aún → se renderizan como "—".
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { ClubReportesScreenView, type ReportesData } from "./ClubReportesScreenView";

function startOfWeek(d: Date): Date {
  const day = d.getDay() || 7;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (day - 1));
  return monday;
}
function parseDuringStart(during: string): Date {
  const m = during.match(/^[[(]"?([^",)]+)/);
  return new Date(m?.[1] ?? during);
}
function parseDuringEnd(during: string): Date {
  const m = during.match(/[,]"?([^",)]+)"?[)\]]$/);
  return new Date(m?.[1] ?? during);
}

async function loadData(): Promise<ReportesData> {
  const clubId = await resolveActiveClubId({ staffRoles: ["manager", "owner", "admin"] });
  if (!clubId) return emptyData();

  const supabase = await getServerClient();

  const weekStart = startOfWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const weekNumber = Math.ceil(
    ((weekStart.getTime() -
      new Date(weekStart.getFullYear(), 0, 1).getTime()) /
      86400000 +
      1) /
      7,
  );

  const [
    { data: courts },
    { data: weekResv },
    { data: prevWeekResv },
    { data: monthResv },
  ] = await Promise.all([
    supabase
      .from("courts")
      .select("id")
      .eq("club_id", clubId)
      .eq("active", true),
    supabase
      .from("reservations")
      .select("court_id,during,sport,status,organizer_id")
      .eq("club_id", clubId)
      .gte("during", weekStart.toISOString())
      .lt("during", weekEnd.toISOString())
      .neq("status", "cancelled"),
    supabase
      .from("reservations")
      .select("during,status")
      .eq("club_id", clubId)
      .gte("during", prevWeekStart.toISOString())
      .lt("during", weekStart.toISOString())
      .neq("status", "cancelled"),
    supabase
      .from("reservations")
      .select("status,organizer_id,during")
      .eq("club_id", clubId)
      .gte("during", monthAgo.toISOString()),
  ]);

  const courtsCount = (courts ?? []).length;

  // Heatmap 7 días × 24 horas, % de ocupación = reservas / canchas.
  const heatmap: number[][] = Array(7)
    .fill(null)
    .map(() => Array(24).fill(0));
  for (const r of weekResv ?? []) {
    const start = parseDuringStart(r.during as string);
    const end = parseDuringEnd(r.during as string);
    const dayIdx = (start.getDay() || 7) - 1;
    const startHour = start.getHours();
    const endHour = Math.max(startHour + 1, end.getHours());
    for (let h = startHour; h < endHour && h < 24; h++) {
      if (dayIdx >= 0 && dayIdx < 7) heatmap[dayIdx][h] += 1;
    }
  }
  // Normalizar a % (cap 100).
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      heatmap[d][h] =
        courtsCount > 0 ? Math.min(100, Math.round((heatmap[d][h] / courtsCount) * 100)) : 0;
    }
  }

  // Pico de la semana.
  let peakDay = 0, peakHour = 0, peakVal = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (heatmap[d][h] > peakVal) {
        peakVal = heatmap[d][h];
        peakDay = d;
        peakHour = h;
      }
    }
  }

  // Ocupación general semana.
  const totalCells = courtsCount * 7 * 24;
  const reservedCells = (weekResv ?? []).reduce((s, r) => {
    const start = parseDuringStart(r.during as string);
    const end = parseDuringEnd(r.during as string);
    const hours = Math.max(1, Math.round((end.getTime() - start.getTime()) / 3600000));
    return s + hours;
  }, 0);
  const ocupacionPct = totalCells > 0 ? Math.round((reservedCells / totalCells) * 100) : 0;

  const prevReservedCells = (prevWeekResv ?? []).reduce((s, r) => {
    const start = parseDuringStart(r.during as string);
    const end = parseDuringEnd(r.during as string);
    const hours = Math.max(1, Math.round((end.getTime() - start.getTime()) / 3600000));
    return s + hours;
  }, 0);
  const prevOcupacionPct =
    totalCells > 0 ? Math.round((prevReservedCells / totalCells) * 100) : 0;
  const ocupacionDeltaPp = ocupacionPct - prevOcupacionPct;

  // Distribución por deporte (semana).
  const sportCount = new Map<string, number>();
  for (const r of weekResv ?? []) {
    const k = (r.sport as string) ?? "otro";
    sportCount.set(k, (sportCount.get(k) ?? 0) + 1);
  }
  const totalMatches = Array.from(sportCount.values()).reduce((a, b) => a + b, 0);
  const sportsRaw = Array.from(sportCount.entries())
    .map(([k, v]) => ({
      key: k,
      label: sportEs(k),
      count: v,
      pct: totalMatches > 0 ? Math.round((v / totalMatches) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
  const matchesPerDay = Math.round(totalMatches / 7);

  // Top socios (mes) — agrupando por organizer_id.
  const memberCount = new Map<string, number>();
  for (const r of monthResv ?? []) {
    if ((r.status as string) === "cancelled") continue;
    const id = r.organizer_id as string;
    if (!id) continue;
    memberCount.set(id, (memberCount.get(id) ?? 0) + 1);
  }
  const topIds = Array.from(memberCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  let topMembers: { name: string; visits: number }[] = [];
  if (topIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in(
        "id",
        topIds.map(([id]) => id),
      );
    const nameById = new Map<string, string>();
    for (const p of profs ?? []) {
      nameById.set(p.id as string, (p.display_name as string) ?? "Socio");
    }
    topMembers = topIds.map(([id, v]) => ({
      name: nameById.get(id) ?? "Socio",
      visits: v,
    }));
  }

  // No-shows (30 días).
  const monthArr = monthResv ?? [];
  const totalMonth = monthArr.length;
  const noShowsCount = monthArr.filter((r) => (r.status as string) === "no_show").length;
  const cancelledCount = monthArr.filter(
    (r) => (r.status as string) === "cancelled",
  ).length;
  const noShowPct = totalMonth > 0 ? +((noShowsCount / totalMonth) * 100).toFixed(1) : 0;

  return {
    clubId,
    weekNumber,
    courtsCount,
    ocupacionPct,
    ocupacionDeltaPp,
    heatmap,
    peakDay,
    peakHour,
    peakVal,
    sports: sportsRaw,
    matchesPerDay,
    totalMatches,
    topMembers,
    noShowPct,
    noShowsCount,
    cancelledCount,
    monthReservationsCount: totalMonth,
  };
}

function emptyData(): ReportesData {
  return {
    clubId: null,
    weekNumber: 0,
    courtsCount: 0,
    ocupacionPct: 0,
    ocupacionDeltaPp: 0,
    heatmap: Array(7)
      .fill(null)
      .map(() => Array(24).fill(0)),
    peakDay: 0,
    peakHour: 0,
    peakVal: 0,
    sports: [],
    matchesPerDay: 0,
    totalMatches: 0,
    topMembers: [],
    noShowPct: 0,
    noShowsCount: 0,
    cancelledCount: 0,
    monthReservationsCount: 0,
  };
}

function sportEs(sport: string): string {
  switch (sport) {
    case "padel": return "Pádel";
    case "tennis": return "Tenis";
    case "pickleball": return "Pickleball";
    case "squash": return "Squash";
    default: return sport ? sport[0].toUpperCase() + sport.slice(1) : "Otro";
  }
}

export async function ClubReportesScreen() {
  const data = await loadData();
  return <ClubReportesScreenView data={data} />;
}
