// Server: cola de moderación + resumen 30d desde reports + moderation_actions.
import { getServerClient } from "@/lib/db/client.server";
import { AdminModScreenView, type ModData, type CaseRow } from "./AdminModScreenView";

function relativeTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

// Sin campo severity en reports; derivar por entidad reportada.
function severityFor(entity: string): "alta" | "media" | "baja" {
  if (entity === "chat_message" || entity === "match_result" || entity === "user") return "alta";
  if (entity === "club" || entity === "tournament") return "media";
  return "baja";
}

async function loadData(): Promise<ModData> {
  const supabase = await getServerClient();
  const now = new Date();
  const thirtyAgo = new Date(now);
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);

  const [{ data: openReports }, { data: actions30 }, { data: resolved30 }] = await Promise.all([
    supabase
      .from("reports")
      .select("id,reporter_id,entity,entity_id,reason,details,status,created_at")
      .in("status", ["pending", "reviewing"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("moderation_actions")
      .select("action,performed_at")
      .gte("performed_at", thirtyAgo.toISOString()),
    supabase
      .from("reports")
      .select("created_at,reviewed_at,status")
      .in("status", ["actioned", "dismissed"])
      .gte("reviewed_at", thirtyAgo.toISOString()),
  ]);

  const reporterIds = Array.from(new Set((openReports ?? []).map((r) => r.reporter_id as string)));
  const reporterNames = new Map<string, string>();
  if (reporterIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", reporterIds);
    for (const p of profs ?? []) reporterNames.set(p.id as string, p.display_name as string);
  }

  const cases: CaseRow[] = (openReports ?? []).map((r) => {
    const entity = (r.entity as string) ?? "—";
    const reportId = r.id as string;
    return {
      reportId,
      displayId: `MOD-${reportId.slice(0, 8).toUpperCase()}`,
      t: (r.reason as string) ?? "Reporte",
      who: `${entity} · ${(r.entity_id as string).slice(0, 8)}`,
      sev: severityFor(entity),
      when: relativeTime(r.created_at as string, now),
      evidence: (r.details as string) ?? (r.reason as string) ?? "—",
      reporter: reporterNames.get(r.reporter_id as string) ?? "Anónimo",
    };
  });

  let warnCount = 0;
  let suspendCount = 0;
  let dismissCount = 0;
  for (const a of actions30 ?? []) {
    const k = a.action as string;
    if (k === "warn") warnCount++;
    else if (k === "suspend" || k === "ban") suspendCount++;
    else if (k === "dismiss") dismissCount++;
  }
  const resolvedCount = (resolved30 ?? []).length;
  let totalMins = 0;
  let withDuration = 0;
  for (const r of resolved30 ?? []) {
    if (!r.reviewed_at) continue;
    const created = new Date(r.created_at as string).getTime();
    const reviewed = new Date(r.reviewed_at as string).getTime();
    totalMins += Math.floor((reviewed - created) / 60000);
    withDuration++;
  }
  const avgMin = withDuration > 0 ? Math.round(totalMins / withDuration) : 0;
  const avgLabel =
    avgMin === 0 ? "—" : avgMin < 60 ? `${avgMin} min` : `${(avgMin / 60).toFixed(1)} h`;

  return {
    queueCount: cases.length,
    cases,
    summary: { resolvedCount, suspendCount, warnCount, dismissCount, avgLabel },
  };
}

export async function AdminModScreen() {
  const data = await loadData();
  return <AdminModScreenView data={data} />;
}
