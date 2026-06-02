import "server-only";

import {
  SCHEDULE_HOUR_LABELS,
  SCHEDULE_HOURS,
  buildCourtWeekGrids,
  dayIndexInWeek,
  slotStartMs,
  startOfWeek,
} from "@/lib/reservations/court-schedule";
import type { ScheduleCellMeta } from "@/lib/reservations/court-schedule";

export type CourtDayRow = {
  id: string;
  label: string;
  sport: string;
  /** Por hora (mismo orden que SCHEDULE_HOURS). */
  slots: number[];
  cellMeta: Record<number, ScheduleCellMeta>;
};

export type HourAvailability = {
  hour: string;
  hourIdx: number;
  freeCount: number;
  freeLabels: string[];
  totalCourts: number;
};

export type CourtDayScheduleData = {
  clubId: string;
  clubName: string;
  dayLabel: string;
  dateIso: string;
  weekStartIso: string;
  dayIdx: number;
  hours: string[];
  courts: CourtDayRow[];
  hourAvailability: HourAvailability[];
};

export async function loadCourtDaySchedule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clubId: string,
  targetDay: Date = new Date(),
): Promise<CourtDayScheduleData | null> {
  const weekStart = startOfWeek(targetDay);
  const dayIdx = dayIndexInWeek(targetDay, weekStart);
  if (dayIdx < 0 || dayIdx > 6) return null;

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const monthsShort = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const daysShort = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const dayLabel = `${daysShort[targetDay.getDay()]} ${targetDay.getDate()} ${monthsShort[targetDay.getMonth()]}`;

  const [{ data: club }, { data: courts }, { data: reservations }] = await Promise.all([
    supabase.from("clubs").select("id,name,timezone").eq("id", clubId).maybeSingle(),
    supabase
      .from("courts")
      .select("id,code,name,sport")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("ordinal"),
    supabase
      .from("reservations")
      .select("id,court_id,during,status,kind,notes,organizer_id,for_user_id")
      .eq("club_id", clubId)
      .overlaps("during", `[${weekStart.toISOString()},${weekEnd.toISOString()})`)
      .neq("status", "cancelled"),
  ]);

  if (!club) return null;

  const courtList = (courts ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    label: ((c.code as string) ?? (c.name as string) ?? "Cancha").slice(0, 14),
    sport: c.sport as string,
  }));

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

  const clubTz = (club.timezone as string | null) ?? "America/Guayaquil";
  const weekStartIso = weekStart.toISOString();
  const { grids, metas } = buildCourtWeekGrids(
    courtList.map((c: CourtListItem) => c.id),
    (reservations ?? []) as Parameters<typeof buildCourtWeekGrids>[1],
    weekStart,
    clubTz,
    nameById,
  );

  type CourtListItem = { id: string; label: string; sport: string };
  const courtRows: CourtDayRow[] = courtList.map((c: CourtListItem) => {
    const weekGrid = grids.get(c.id) ?? [];
    const daySlots = weekGrid[dayIdx] ?? Array(SCHEDULE_HOURS.length).fill(0);
    const weekMeta = metas.get(c.id) ?? {};
    const cellMeta: Record<number, ScheduleCellMeta> = {};
    for (let hi = 0; hi < SCHEDULE_HOURS.length; hi++) {
      const m = weekMeta[`${dayIdx}-${hi}`];
      if (m) cellMeta[hi] = m;
    }
    return {
      id: c.id,
      label: c.label,
      sport: c.sport,
      slots: daySlots,
      cellMeta,
    };
  });

  const hourAvailability: HourAvailability[] = SCHEDULE_HOURS.map((h, hourIdx) => {
    const freeLabels: string[] = [];
    for (const c of courtRows) {
      if (c.slots[hourIdx] === 0) freeLabels.push(c.label);
    }
    return {
      hour: `${String(h).padStart(2, "0")}:00`,
      hourIdx,
      freeCount: freeLabels.length,
      freeLabels,
      totalCourts: courtRows.length,
    };
  });

  return {
    clubId,
    clubName: (club.name as string) ?? "Club",
    dayLabel,
    dateIso: targetDay.toISOString(),
    weekStartIso,
    dayIdx,
    hours: SCHEDULE_HOURS.map((h) => `${String(h).padStart(2, "0")}:00`),
    courts: courtRows,
    hourAvailability,
  };
}
