// Server: lista de clases del coach con conteo de inscritos.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { CoachClasesScreenView, type ClasesData, type ClassRow } from "./CoachClasesScreenView";

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function parseDays(rrule: string | null): string {
  if (!rrule) return "—";
  // BYDAY=MO,WE,FR
  const m = rrule.match(/BYDAY=([A-Z,]+)/);
  if (!m) return "—";
  const map: Record<string, string> = {
    MO: "Lun",
    TU: "Mar",
    WE: "Mié",
    TH: "Jue",
    FR: "Vie",
    SA: "Sáb",
    SU: "Dom",
  };
  return m[1]
    .split(",")
    .map((d) => map[d] ?? d)
    .join(" · ");
}

async function loadData(): Promise<ClasesData> {
  const session = await getSession();
  if (!session.authenticated) {
    return { coachId: null, classes: [] };
  }
  const coachId = session.session.userId;
  const supabase = await getServerClient();

  const { data: classes } = await supabase
    .from("classes")
    .select("id,name,kind,max_students,price_cents,recurrence_rule,active")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false });

  const classIds = (classes ?? []).map((c) => c.id as string);

  // Conteo de inscritos por clase (status enrolled)
  const { data: enrollments } = classIds.length > 0
    ? await supabase
        .from("class_enrollments")
        .select("class_id,status")
        .in("class_id", classIds)
        .eq("status", "enrolled")
    : { data: [] as { class_id: string; status: string }[] };

  const enrolledByClass = new Map<string, number>();
  for (const e of enrollments ?? []) {
    const k = e.class_id as string;
    enrolledByClass.set(k, (enrolledByClass.get(k) ?? 0) + 1);
  }

  // Próxima sesión por clase para horario
  const { data: nextSessions } = classIds.length > 0
    ? await supabase
        .from("class_sessions")
        .select("class_id,during,status")
        .in("class_id", classIds)
        .gte("during", new Date().toISOString())
        .neq("status", "cancelled")
        .order("during", { ascending: true })
    : { data: [] as { class_id: string; during: unknown; status: string }[] };

  const nextSessByClass = new Map<string, string>();
  for (const s of nextSessions ?? []) {
    const k = s.class_id as string;
    if (nextSessByClass.has(k)) continue;
    const raw = typeof s.during === "string" ? s.during : String(s.during ?? "");
    const m = raw.match(/^[[(]"?([^",)]+)"?,"?([^",)]+)/);
    if (!m) continue;
    const start = new Date(m[1]);
    const end = new Date(m[2]);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
    const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    nextSessByClass.set(k, `${fmt(start)} – ${fmt(end)}`);
  }

  const rows: ClassRow[] = (classes ?? []).map((c) => {
    const enrolled = enrolledByClass.get(c.id as string) ?? 0;
    const cap = (c.max_students as number) ?? 1;
    let st: ClassRow["st"] = "active";
    if (c.active === false) st = "paused";
    else if (enrolled >= cap) st = "full";
    return {
      id: c.id as string,
      name: c.name as string,
      kind: c.kind === "one_on_one" || c.kind === "semi_private" ? "Individual" : "Grupal",
      day: parseDays((c.recurrence_rule as string | null) ?? null),
      time: nextSessByClass.get(c.id as string) ?? "—",
      enrolled,
      cap,
      price: `$${Math.round(((c.price_cents as number) ?? 0) / 100)}`,
      st,
    };
  });

  return { coachId, classes: rows };
}

export async function CoachClasesScreen() {
  const data = await loadData();
  return <CoachClasesScreenView data={data} />;
}
