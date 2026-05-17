// Server: calendario semanal del coach (class_sessions + lessons_1on1).
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { CoachCalendarScreenView, type CalendarData } from "./CoachCalendarScreenView";

const HOURS = [9, 11, 14, 17, 19, 21];
const DAY_LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

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
    return `Semana ${start.getDate()} – ${end.getDate()} ${monthsShort[start.getMonth()]}`;
  }
  return `Semana ${start.getDate()} ${monthsShort[start.getMonth()]} – ${end.getDate()} ${monthsShort[end.getMonth()]}`;
}

function dayLabelsForWeek(start: Date): string[] {
  return DAY_LABELS.map((d, i) => {
    const x = new Date(start);
    x.setDate(x.getDate() + i);
    return `${d} ${x.getDate()}`;
  });
}

function emptyGrid(): number[][] {
  return Array(HOURS.length)
    .fill(null)
    .map(() => Array(7).fill(0));
}

function rangeStart(during: unknown): Date | null {
  const s = typeof during === "string" ? during : String(during ?? "");
  const m = s.match(/^[[(]"?([^",)]+)/);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d;
}

async function loadData(): Promise<CalendarData> {
  const session = await getSession();
  const weekStart = startOfWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekLabel = fmtWeekRange(weekStart);
  const days = dayLabelsForWeek(weekStart);

  if (!session.authenticated) {
    return {
      coachId: null,
      weekLabel,
      days,
      grid: emptyGrid(),
    };
  }

  const coachId = session.session.userId;
  const supabase = await getServerClient();

  const { data: myClasses } = await supabase
    .from("classes")
    .select("id,kind")
    .eq("coach_id", coachId);
  const classIds = (myClasses ?? []).map((c) => c.id as string);
  const classKindById = new Map<string, string>();
  for (const c of myClasses ?? []) classKindById.set(c.id as string, c.kind as string);

  const [{ data: sessions }, { data: lessons }] = await Promise.all([
    classIds.length > 0
      ? supabase
          .from("class_sessions")
          .select("class_id,during,status")
          .in("class_id", classIds)
          .gte("during", weekStart.toISOString())
          .lt("during", weekEnd.toISOString())
          .neq("status", "cancelled")
      : Promise.resolve({ data: [] as { class_id: string; during: unknown; status: string }[] }),
    supabase
      .from("lessons_1on1")
      .select("during,status")
      .eq("coach_id", coachId)
      .gte("during", weekStart.toISOString())
      .lt("during", weekEnd.toISOString())
      .neq("status", "cancelled"),
  ]);

  const grid = emptyGrid();

  function place(start: Date, value: number) {
    const dayIdx = (start.getDay() || 7) - 1;
    if (dayIdx < 0 || dayIdx > 6) return;
    const h = start.getHours();
    let hourIdx = -1;
    let minDiff = 99;
    for (let i = 0; i < HOURS.length; i++) {
      const diff = Math.abs(h - HOURS[i]);
      if (diff < minDiff) {
        minDiff = diff;
        hourIdx = i;
      }
    }
    if (hourIdx < 0) return;
    // No sobreescribir si ya hay algo mayor
    if (grid[hourIdx][dayIdx] === 0) grid[hourIdx][dayIdx] = value;
  }

  for (const s of sessions ?? []) {
    const start = rangeStart(s.during);
    if (!start) continue;
    const kind = classKindById.get(s.class_id as string);
    place(start, kind === "one_on_one" || kind === "semi_private" ? 2 : 1);
  }
  for (const l of lessons ?? []) {
    const start = rangeStart(l.during);
    if (!start) continue;
    place(start, 2);
  }

  return {
    coachId,
    weekLabel,
    days,
    grid,
  };
}

export async function CoachCalendarScreen() {
  const data = await loadData();
  return <CoachCalendarScreenView data={data} />;
}
