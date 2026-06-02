// Grid hora a hora de canchas (09:00–22:00). Compartido recepción + club.

export const SCHEDULE_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22] as const;

export const SCHEDULE_HOUR_LABELS = SCHEDULE_HOURS.map((h) =>
  String(h).padStart(2, "0"),
);

export type ScheduleCellState = 0 | 1 | 2 | 3;

export type ScheduleCellMeta = {
  name: string;
  kind: string;
  reservationStatus?: string;
};

export function startOfWeek(d: Date): Date {
  const day = d.getDay() || 7;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (day - 1));
  return monday;
}

export function dayIndexInWeek(day: Date, weekStart: Date): number {
  const a = new Date(weekStart);
  a.setHours(0, 0, 0, 0);
  const b = new Date(day);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function parseReservationRange(raw: string): { start: Date; end: Date } | null {
  const m = raw.match(/^[[(]"?([^",)]+)"?,"?([^",)]+)"?[\])]/);
  if (!m) return null;
  const norm = (s: string) => s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const start = new Date(norm(m[1]));
  const end = new Date(norm(m[2]));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

export function emptyWeekGrid(): number[][] {
  return Array(7)
    .fill(null)
    .map(() => Array(SCHEDULE_HOURS.length).fill(0));
}

type ReservationRow = {
  court_id: string;
  during: string;
  kind?: string | null;
  notes?: string | null;
  organizer_id?: string | null;
  for_user_id?: string | null;
  status?: string | null;
};

export function buildCourtWeekGrids(
  courtIds: string[],
  reservations: ReservationRow[],
  weekStart: Date,
  clubTz: string,
  nameById: Map<string, string>,
): {
  grids: Map<string, number[][]>;
  metas: Map<string, Record<string, ScheduleCellMeta>>;
} {
  const grids = new Map<string, number[][]>();
  const metas = new Map<string, Record<string, ScheduleCellMeta>>();
  for (const id of courtIds) {
    grids.set(id, emptyWeekGrid());
    metas.set(id, {});
  }

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

  for (const r of reservations) {
    const range = parseReservationRange(r.during);
    if (!range) continue;
    const dayName = dayFmt.format(range.start);
    const dayIdx = dayMap[dayName] ?? -1;
    if (dayIdx < 0) continue;
    const startH = parseInt(hourFmt.format(range.start), 10);
    const endH = parseInt(hourFmt.format(range.end), 10);
    if (Number.isNaN(startH) || Number.isNaN(endH)) continue;
    const grid = grids.get(r.court_id);
    if (!grid) continue;

    const kind = (r.kind as string | null) ?? "booking";
    const stateVal: ScheduleCellState =
      kind === "event" ? 2 : kind === "class" ? 3 : 1;
    let name =
      (r.for_user_id && nameById.get(r.for_user_id)) ??
      (r.organizer_id && nameById.get(r.organizer_id)) ??
      "Reserva";
    if (!r.for_user_id && r.notes) {
      const fromNotes = r.notes.split(" · ")[0]?.trim();
      if (fromNotes) name = fromNotes;
    }

    const metaCourt = metas.get(r.court_id) ?? {};
    const fromH = Math.max(startH, SCHEDULE_HOURS[0]);
    const toH = Math.min(endH, SCHEDULE_HOURS[SCHEDULE_HOURS.length - 1] + 1);
    for (let h = fromH; h < toH; h++) {
      const hourIdx = SCHEDULE_HOURS.indexOf(h as (typeof SCHEDULE_HOURS)[number]);
      if (hourIdx < 0) continue;
      grid[dayIdx][hourIdx] = stateVal;
      metaCourt[`${dayIdx}-${hourIdx}`] = {
        name,
        kind,
        reservationStatus: (r.status as string | null) ?? undefined,
      };
    }
    metas.set(r.court_id, metaCourt);
  }

  return { grids, metas };
}

export function slotStartMs(weekStartIso: string, dayIdx: number, hourIdx: number): number {
  const d = new Date(weekStartIso);
  d.setDate(d.getDate() + dayIdx);
  d.setHours(SCHEDULE_HOURS[hourIdx]!, 0, 0, 0);
  return d.getTime();
}

export type ScheduleCellStyle = Record<string, string | number>;

export function scheduleCellStyle(
  state: number,
  opts: { past?: boolean; disabled?: boolean } = {},
): ScheduleCellStyle {
  const { past = false, disabled = false } = opts;
  if (past && state === 0) {
    return {
      minHeight: 34,
      borderRadius: 5,
      fontSize: 9,
      fontWeight: 800,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--muted)",
      color: "var(--muted-fg)",
      cursor: "not-allowed",
      opacity: 0.55,
      padding: "2px 4px",
    };
  }
  const palette: Record<number, { bg: string; fg: string }> = {
    0: { bg: "#d1fae5", fg: "#047857" },
    1: { bg: "var(--primary)", fg: "#fff" },
    2: { bg: "#fbbf24", fg: "#fff" },
    3: { bg: "#7c3aed", fg: "#fff" },
  };
  const p = palette[state] ?? palette[0];
  return {
    minHeight: 34,
    borderRadius: 5,
    fontSize: 9,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: p.bg,
    color: p.fg,
    cursor: disabled ? "not-allowed" : state === 0 ? "pointer" : "default",
    opacity: disabled ? 0.5 : past ? 0.75 : 1,
    padding: "2px 4px",
    textAlign: "center",
    lineHeight: 1.15,
  };
}
