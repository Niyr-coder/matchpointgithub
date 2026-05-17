// Server: alumnos del coach via enrollments + lessons_1on1.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { CoachAlumnosScreenView, type AlumnosData, type StudentRow } from "./CoachAlumnosScreenView";

const GRADIENTS = [
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function fmtDate(d: Date): string {
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${hh}:${mm}`;
}

async function loadData(): Promise<AlumnosData> {
  const session = await getSession();
  if (!session.authenticated) {
    return { coachId: null, students: [] };
  }
  const coachId = session.session.userId;
  const supabase = await getServerClient();

  // Class ids del coach
  const { data: myClasses } = await supabase
    .from("classes")
    .select("id")
    .eq("coach_id", coachId);
  const classIds = (myClasses ?? []).map((c) => c.id as string);

  const [{ data: enrollments }, { data: lessons }] = await Promise.all([
    classIds.length > 0
      ? supabase
          .from("class_enrollments")
          .select("class_id,student_id,status,enrolled_at")
          .in("class_id", classIds)
          .eq("status", "enrolled")
      : Promise.resolve({ data: [] as { class_id: string; student_id: string; status: string; enrolled_at: string }[] }),
    supabase
      .from("lessons_1on1")
      .select("student_id,during,status,created_at")
      .eq("coach_id", coachId)
      .neq("status", "cancelled"),
  ]);

  // Map student -> { classes, lessons, nextDate, nextSessionId }
  type Acc = { classes: number; lessons: number; next: number | null; nextSessionId: string | null };
  const byStudent = new Map<string, Acc>();

  for (const e of enrollments ?? []) {
    const id = e.student_id as string;
    const cur = byStudent.get(id) ?? { classes: 0, lessons: 0, next: null, nextSessionId: null };
    cur.classes += 1;
    byStudent.set(id, cur);
  }
  const now = Date.now();
  for (const l of lessons ?? []) {
    const id = l.student_id as string;
    const cur = byStudent.get(id) ?? { classes: 0, lessons: 0, next: null, nextSessionId: null };
    cur.lessons += 1;
    const raw = typeof l.during === "string" ? l.during : String(l.during ?? "");
    const m = raw.match(/^[[(]"?([^",)]+)/);
    if (m) {
      const t = new Date(m[1]).getTime();
      if (!isNaN(t) && t > now && (cur.next == null || t < cur.next)) cur.next = t;
    }
    byStudent.set(id, cur);
  }

  // Próxima class_session por alumno (joining enrollments → class_sessions)
  if (classIds.length > 0 && (enrollments?.length ?? 0) > 0) {
    const { data: upcomingSess } = await supabase
      .from("class_sessions")
      .select("id,class_id,during,status")
      .in("class_id", classIds)
      .gte("during", new Date().toISOString())
      .neq("status", "cancelled")
      .order("during", { ascending: true });

    // Próxima sesión por class_id (id + timestamp)
    const nextSessByClass = new Map<string, { ts: number; id: string }>();
    for (const s of upcomingSess ?? []) {
      const k = s.class_id as string;
      if (nextSessByClass.has(k)) continue;
      const raw = typeof s.during === "string" ? s.during : String(s.during ?? "");
      const m = raw.match(/^[[(]"?([^",)]+)/);
      if (!m) continue;
      const t = new Date(m[1]).getTime();
      if (!isNaN(t)) nextSessByClass.set(k, { ts: t, id: s.id as string });
    }
    for (const e of enrollments ?? []) {
      const id = e.student_id as string;
      const next = nextSessByClass.get(e.class_id as string);
      if (!next) continue;
      const cur = byStudent.get(id);
      if (!cur) continue;
      if (cur.next == null || next.ts < cur.next) {
        cur.next = next.ts;
        cur.nextSessionId = next.id;
      }
    }
  }

  const studentIds = Array.from(byStudent.keys());
  const { data: profiles } = studentIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", studentIds)
    : { data: [] as { id: string; display_name: string }[] };

  const nameById = new Map<string, string>();
  for (const p of profiles ?? []) nameById.set(p.id as string, (p.display_name as string) ?? "Alumno");

  const students: StudentRow[] = studentIds.map((id, i) => {
    const acc = byStudent.get(id)!;
    const totalClasses = acc.classes + acc.lessons;
    return {
      id,
      name: nameById.get(id) ?? "Alumno",
      av: initials(nameById.get(id) ?? "—"),
      avBg: GRADIENTS[i % GRADIENTS.length],
      lvl: null, // sin tracking aún
      gain: null,
      classes: totalClasses,
      attended: 0, // sin attendance tracking todavía
      next: acc.next != null ? fmtDate(new Date(acc.next)) : "sin agendar",
      nextSessionId: acc.nextSessionId,
    };
  });

  // Orden: por # clases desc
  students.sort((a, b) => b.classes - a.classes);

  return { coachId, students };
}

export async function CoachAlumnosScreen() {
  const data = await loadData();
  return <CoachAlumnosScreenView data={data} />;
}
