// Server: equipo interno MATCHPOINT (role_assignments role=admin sin club_id).
import { getServerClient } from "@/lib/db/client.server";
import { AdminTeamScreenView, type TeamData, type MemberRow } from "./AdminTeamScreenView";

const AV_GRADIENTS = [
  "linear-gradient(135deg,#dc2626,#7f1d1d)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
  "linear-gradient(135deg,#fbbf24,#d97706)",
  "linear-gradient(135deg,#0ea5e9,#0369a1)",
  "linear-gradient(135deg,#0ea5e9,#1e40af)",
  "linear-gradient(135deg,#10b981,#047857)",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AV_GRADIENTS[Math.abs(h) % AV_GRADIENTS.length];
}

async function loadData(): Promise<TeamData> {
  const supabase = await getServerClient();
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const { data: assignments } = await supabase
    .from("role_assignments")
    .select("user_id,granted_at")
    .eq("role", "admin")
    .is("revoked_at", null);

  const adminIds = Array.from(new Set((assignments ?? []).map((a) => a.user_id as string)));
  if (adminIds.length === 0) {
    return {
      rows: [],
      kpis: { onlineCount: 0, totalCount: 0, openCasesCount: 0, slaLabel: "—", resolvedTodayCount: 0 },
    };
  }

  const [{ data: profs }, { data: assignedTickets }, { data: reviewedReportsToday }] =
    await Promise.all([
      supabase.from("profiles").select("id,display_name,username").in("id", adminIds),
      supabase
        .from("tickets")
        .select("assignee_id,status,created_at,resolved_at")
        .in("assignee_id", adminIds),
      supabase
        .from("reports")
        .select("reviewed_by,reviewed_at,status")
        .in("status", ["actioned", "dismissed"])
        .gte("reviewed_at", todayStart.toISOString()),
    ]);

  const loadByUser = new Map<string, number>();
  const openByUser = new Map<string, number>();
  let totalOpenCases = 0;
  let totalMinResolved = 0;
  let countResolved = 0;
  for (const t of assignedTickets ?? []) {
    const uid = t.assignee_id as string;
    const created = new Date(t.created_at as string);
    if (created >= weekAgo) {
      loadByUser.set(uid, (loadByUser.get(uid) ?? 0) + 1);
    }
    if (!["resolved", "closed"].includes(t.status as string)) {
      openByUser.set(uid, (openByUser.get(uid) ?? 0) + 1);
      totalOpenCases++;
    }
    if (t.resolved_at) {
      const min = Math.floor(
        (new Date(t.resolved_at as string).getTime() - created.getTime()) / 60000,
      );
      totalMinResolved += min;
      countResolved++;
    }
  }
  const avgMin = countResolved > 0 ? Math.round(totalMinResolved / countResolved) : 0;
  const slaLabel = avgMin === 0 ? "—" : avgMin < 60 ? `${avgMin} min` : `${(avgMin / 60).toFixed(1)} h`;

  const resolvedToday = (reviewedReportsToday ?? []).length;

  const profileMap = new Map<string, { display_name: string; username: string }>();
  for (const p of profs ?? []) {
    profileMap.set(p.id as string, {
      display_name: p.display_name as string,
      username: p.username as string,
    });
  }

  const rows: MemberRow[] = adminIds.map((id) => {
    const p = profileMap.get(id);
    const name = p?.display_name ?? "Sin nombre";
    return {
      id,
      n: name,
      email: p?.username ? `@${p.username}` : "—",
      role: "Admin",
      av: initials(name),
      avBg: gradientFor(id),
      area: "Plataforma",
      load: loadByUser.get(id) ?? 0,
      openCases: openByUser.get(id) ?? 0,
      online: false,
      lastAct: "—",
    };
  });

  return {
    rows,
    kpis: {
      onlineCount: 0,
      totalCount: rows.length,
      openCasesCount: totalOpenCases,
      slaLabel,
      resolvedTodayCount: resolvedToday,
    },
  };
}

export async function AdminTeamScreen() {
  const data = await loadData();
  return <AdminTeamScreenView data={data} />;
}
