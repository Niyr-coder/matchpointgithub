// Server: fetch mis enrollments + próxima sesión por clase + historial.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { MisClasesScreenView, type EnrolledClass, type PastEnrollment } from "./MisClasesScreenView";

const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
};

async function loadData() {
  const session = await getSession();
  if (!session.authenticated) {
    return { enrolled: [], past: [], totalCompletedSessions: 0, pendingSessions: 0 };
  }
  const userId = session.session.userId;
  const supabase = await getServerClient();

  // Mis enrollments con la clase + coach + club.
  const { data: rows } = await supabase
    .from("class_enrollments")
    .select(
      "id,status,enrolled_at,class_id,classes(id,name,sport,max_students,coach_id,club_id,clubs(name),coach_profiles(id,profiles(display_name)))",
    )
    .eq("student_id", userId)
    .in("status", ["enrolled", "completed"])
    .order("enrolled_at", { ascending: false });

  const enrolledRows = (rows ?? []).filter((r) => r.status === "enrolled");
  const completedRows = (rows ?? []).filter((r) => r.status === "completed");

  // Próximas sesiones para clases activas.
  const activeClassIds = enrolledRows.map((r) => r.class_id as string);
  const { data: upcomingSessions } =
    activeClassIds.length > 0
      ? await supabase
          .from("class_sessions")
          .select("class_id,during,status")
          .in("class_id", activeClassIds)
          .gte("during", new Date().toISOString())
          .eq("status", "scheduled")
          .order("during", { ascending: true })
      : { data: [] };

  const nextByClass = new Map<string, string>();
  for (const s of upcomingSessions ?? []) {
    const k = s.class_id as string;
    if (!nextByClass.has(k)) nextByClass.set(k, s.during as string);
  }

  // Counts de sesiones por clase (total + completadas).
  const allEnrolledClassIds = (rows ?? []).map((r) => r.class_id as string);
  const { data: allSessions } =
    allEnrolledClassIds.length > 0
      ? await supabase
          .from("class_sessions")
          .select("class_id,status")
          .in("class_id", allEnrolledClassIds)
      : { data: [] };

  const sessionsByClass = new Map<string, { total: number; completed: number }>();
  for (const s of allSessions ?? []) {
    const k = s.class_id as string;
    const cur = sessionsByClass.get(k) ?? { total: 0, completed: 0 };
    cur.total += 1;
    if (s.status === "completed") cur.completed += 1;
    sessionsByClass.set(k, cur);
  }

  const enrolled: EnrolledClass[] = enrolledRows.map((r) => {
    const cls = r.classes as Record<string, unknown> | null;
    const coachProfile = cls?.coach_profiles as { profiles?: { display_name?: string } } | null;
    const club = cls?.clubs as { name?: string } | null;
    const coachName = coachProfile?.profiles?.display_name ?? "Coach";
    const counts = sessionsByClass.get(r.class_id as string) ?? { total: 0, completed: 0 };
    return {
      id: r.id as string,
      classId: r.class_id as string,
      name: (cls?.name as string) ?? "Clase",
      coachName,
      sport: SPORT_LABEL[(cls?.sport as string) ?? "pickleball"] ?? "Pickleball",
      club: club?.name ?? "—",
      nextSessionAt: nextByClass.get(r.class_id as string) ?? null,
      sessionsCompleted: counts.completed,
      sessionsTotal: counts.total,
    };
  });

  const past: PastEnrollment[] = completedRows.map((r) => {
    const cls = r.classes as Record<string, unknown> | null;
    const coachProfile = cls?.coach_profiles as { profiles?: { display_name?: string } } | null;
    const counts = sessionsByClass.get(r.class_id as string) ?? { total: 0, completed: 0 };
    return {
      id: r.id as string,
      name: (cls?.name as string) ?? "Clase",
      coachName: coachProfile?.profiles?.display_name ?? "Coach",
      completed: counts.completed,
      total: counts.total,
      enrolledAt: r.enrolled_at as string,
    };
  });

  const totalCompletedSessions = past.reduce((acc, p) => acc + p.completed, 0)
    + enrolled.reduce((acc, e) => acc + e.sessionsCompleted, 0);
  const pendingSessions = enrolled.reduce((acc, e) => acc + Math.max(0, e.sessionsTotal - e.sessionsCompleted), 0);

  return { enrolled, past, totalCompletedSessions, pendingSessions };
}

export async function MisClasesScreen() {
  const data = await loadData();
  return <MisClasesScreenView {...data} />;
}
