// Server: home del coach con KPIs + agenda de hoy + próxima clase + top alumnos.
// El coach es un user con coach_profile (1:1 con profiles, id = auth.uid()).
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { CoachHomeView, type CoachHomeData, type AgendaItem, type TopStudent } from "./CoachHomeView";

type SessionRow = {
  id: string;
  during: unknown;
  status: string;
  class_id: string;
  classes?: { id: string; name: string; kind: string; max_students: number; coach_id: string; club_id: string } | null;
};

type LessonRow = {
  id: string;
  during: unknown;
  status: string;
  student_id: string;
  coach_id: string;
};

function rangeStart(during: unknown): Date | null {
  const s = typeof during === "string" ? during : String(during ?? "");
  const m = s.match(/^[[(]"?([^",)]+)/);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d;
}

function fmtHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function loadData(): Promise<CoachHomeData> {
  const session = await getSession();
  if (!session.authenticated) {
    return {
      coachId: null,
      userName: null,
      kpis: {
        classesToday: 0,
        groupToday: 0,
        individualToday: 0,
        studentsActive: 0,
        newStudentsMonth: 0,
        revenueMonthCents: 0,
      },
      agenda: [],
      next: null,
      topStudents: [],
      studentsTotal: 0,
    };
  }

  const coachId = session.session.userId;
  const supabase = await getServerClient();
  const profile = await getProfileSummary(coachId);
  const userName = profile.displayName ?? profile.username ?? null;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Clases del coach (para agarrar class_ids).
  const { data: myClasses } = await supabase
    .from("classes")
    .select("id,name,kind,max_students,club_id,coach_id")
    .eq("coach_id", coachId);

  const classIds = (myClasses ?? []).map((c) => c.id as string);

  const [
    { data: sessionsToday },
    { data: lessonsToday },
    { data: enrollments },
    { data: txnsMonth },
  ] = await Promise.all([
    classIds.length > 0
      ? supabase
          .from("class_sessions")
          .select("id,during,status,class_id")
          .in("class_id", classIds)
          .gte("during", dayStart.toISOString())
          .lt("during", dayEnd.toISOString())
          .neq("status", "cancelled")
      : Promise.resolve({ data: [] as SessionRow[] }),
    supabase
      .from("lessons_1on1")
      .select("id,during,status,student_id,coach_id")
      .eq("coach_id", coachId)
      .gte("during", dayStart.toISOString())
      .lt("during", dayEnd.toISOString())
      .neq("status", "cancelled"),
    classIds.length > 0
      ? supabase
          .from("class_enrollments")
          .select("id,class_id,student_id,enrolled_at,status")
          .in("class_id", classIds)
          .eq("status", "enrolled")
      : Promise.resolve({ data: [] as { id: string; class_id: string; student_id: string; enrolled_at: string; status: string }[] }),
    supabase
      .from("transactions")
      .select("amount_cents,status,created_at,kind,ref_id")
      .eq("kind", "class")
      .eq("status", "captured")
      .gte("created_at", monthStart.toISOString()),
  ]);

  const classById = new Map<string, { name: string; kind: string; max_students: number }>();
  for (const c of myClasses ?? []) {
    classById.set(c.id as string, {
      name: c.name as string,
      kind: c.kind as string,
      max_students: c.max_students as number,
    });
  }

  // Agenda
  const sessionsRows = (sessionsToday ?? []) as SessionRow[];
  const lessonsRows = (lessonsToday ?? []) as LessonRow[];

  // enrollments por class_id (para mostrar cap actual)
  const enrolledByClass = new Map<string, number>();
  for (const e of enrollments ?? []) {
    const k = e.class_id as string;
    enrolledByClass.set(k, (enrolledByClass.get(k) ?? 0) + 1);
  }

  // Student names lookup (lessons + top students)
  const allStudentIds = new Set<string>();
  for (const l of lessonsRows) allStudentIds.add(l.student_id);
  for (const e of enrollments ?? []) allStudentIds.add(e.student_id as string);

  const { data: studentProfiles } = allStudentIds.size > 0
    ? await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", Array.from(allStudentIds))
    : { data: [] as { id: string; display_name: string }[] };

  const studentName = new Map<string, string>();
  for (const p of studentProfiles ?? []) studentName.set(p.id as string, (p.display_name as string) ?? "Alumno");

  const agenda: AgendaItem[] = [];
  for (const s of sessionsRows) {
    const start = rangeStart(s.during);
    if (!start) continue;
    const info = classById.get(s.class_id);
    if (!info) continue;
    const enrolled = enrolledByClass.get(s.class_id) ?? 0;
    const subParts: string[] = ["60 min"];
    const isIndividual = info.kind === "one_on_one" || info.kind === "semi_private";
    if (!isIndividual) subParts.push(`${enrolled} / ${info.max_students}`);
    agenda.push({
      id: s.id,
      time: fmtHHmm(start),
      timestamp: start.getTime(),
      title: info.name,
      sub: subParts.join(" · "),
      kind: isIndividual ? "individual" : "group",
    });
  }
  for (const l of lessonsRows) {
    const start = rangeStart(l.during);
    if (!start) continue;
    const who = studentName.get(l.student_id) ?? "Alumno";
    agenda.push({
      id: l.id,
      time: fmtHHmm(start),
      timestamp: start.getTime(),
      title: `${who} · 1 a 1`,
      sub: "60 min",
      kind: "individual",
    });
  }
  agenda.sort((a, b) => a.timestamp - b.timestamp);

  // Marcar status: completed/next/upcoming
  const nowMs = now.getTime();
  let nextAssigned = false;
  for (const a of agenda) {
    if (a.timestamp + 60 * 60 * 1000 < nowMs) {
      a.status = "completed";
    } else if (!nextAssigned) {
      a.status = "next";
      nextAssigned = true;
    } else {
      a.status = "upcoming";
    }
  }

  // KPIs hoy
  const groupToday = agenda.filter((a) => a.kind === "group").length;
  const individualToday = agenda.filter((a) => a.kind === "individual").length;

  // Alumnos activos (distinct enrolled student_ids + students from lessons last 90d)
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const { data: recentLessons } = await supabase
    .from("lessons_1on1")
    .select("student_id,created_at")
    .eq("coach_id", coachId)
    .gte("created_at", ninetyDaysAgo.toISOString());

  const studentsActiveSet = new Set<string>();
  for (const e of enrollments ?? []) studentsActiveSet.add(e.student_id as string);
  for (const l of recentLessons ?? []) studentsActiveSet.add(l.student_id as string);

  const newStudentsMonth = (enrollments ?? []).filter((e) => {
    const t = new Date(e.enrolled_at as string);
    return t >= monthStart;
  }).length;

  // Revenue: tx con kind=class, ref_id puede ser session o lesson. Filtramos por ref_id ∈ sessionIds OR lessonIds del coach.
  // Para no traer todas las sessions del año, pedimos sessions y lessons del coach del mes.
  const [{ data: monthSessions }, { data: monthLessons }] = await Promise.all([
    classIds.length > 0
      ? supabase
          .from("class_sessions")
          .select("id")
          .in("class_id", classIds)
          .gte("during", monthStart.toISOString())
      : Promise.resolve({ data: [] as { id: string }[] }),
    supabase
      .from("lessons_1on1")
      .select("id")
      .eq("coach_id", coachId)
      .gte("created_at", monthStart.toISOString()),
  ]);
  const refIdSet = new Set<string>();
  for (const s of monthSessions ?? []) refIdSet.add(s.id as string);
  for (const l of monthLessons ?? []) refIdSet.add(l.id as string);

  let revenueMonthCents = 0;
  for (const t of txnsMonth ?? []) {
    if (t.ref_id && refIdSet.has(t.ref_id as string)) {
      revenueMonthCents += (t.amount_cents as number) ?? 0;
    }
  }

  // Top students: top 4 por # clases del coach (enrollments con status enrolled)
  const classCountByStudent = new Map<string, number>();
  for (const e of enrollments ?? []) {
    const id = e.student_id as string;
    classCountByStudent.set(id, (classCountByStudent.get(id) ?? 0) + 1);
  }
  for (const l of recentLessons ?? []) {
    const id = l.student_id as string;
    classCountByStudent.set(id, (classCountByStudent.get(id) ?? 0) + 1);
  }
  const topStudents: TopStudent[] = Array.from(classCountByStudent.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([sid, count]) => ({
      id: sid,
      name: studentName.get(sid) ?? "Alumno",
      classes: count,
    }));

  // Next class for hero
  const next = agenda.find((a) => a.status === "next") ?? null;

  return {
    coachId,
    userName,
    kpis: {
      classesToday: agenda.length,
      groupToday,
      individualToday,
      studentsActive: studentsActiveSet.size,
      newStudentsMonth,
      revenueMonthCents,
    },
    agenda,
    next: next
      ? {
          id: next.id,
          time: next.time,
          title: next.title,
          sub: next.sub,
          minutesUntil: Math.max(0, Math.round((next.timestamp - nowMs) / 60000)),
        }
      : null,
    topStudents,
    studentsTotal: studentsActiveSet.size,
  };
}

export async function CoachHome() {
  const data = await loadData();
  return <CoachHomeView data={data} />;
}
