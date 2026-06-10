// Server: home del admin con KPIs globales reales + actividad reciente desde audit_log.
import { getServerClient } from "@/lib/db/client.server";
import {
  AUDIT_HOME_NOISE_ENTITIES,
  auditActivitySubtitle,
  auditEntityMeta,
  summarizeAuditEvent,
} from "@/lib/audit/labels";
import { AdminHomeView, type AdminHomeData, type ActivityItem, type ModQueueItem } from "./AdminHomeView";

function relativeTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return "hoy";
}

function severityFor(entity: string): "alta" | "media" | "baja" {
  if (entity === "chat_message" || entity === "match_result" || entity === "user") return "alta";
  if (entity === "club" || entity === "tournament") return "media";
  return "baja";
}

async function loadData(): Promise<AdminHomeData> {
  const supabase = await getServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const [
    { count: profilesCount },
    { count: clubsActiveCount },
    { count: clubsThisWeekCount },
    { data: txnsMonth },
    { data: txnsPrev },
    { count: matchesWeekCount },
    { data: auditRows },
    { data: openReports },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("clubs").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("clubs")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gte("created_at", weekStart.toISOString()),
    supabase
      .from("transactions")
      .select("amount_cents")
      .eq("status", "captured")
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("transactions")
      .select("amount_cents")
      .eq("status", "captured")
      .gte("created_at", prevMonthStart.toISOString())
      .lt("created_at", monthStart.toISOString()),
    supabase
      .from("match_results")
      .select("id", { count: "exact", head: true })
      .gte("played_at", weekStart.toISOString()),
    supabase
      .from("audit_log")
      .select("id,entity,entity_id,action,actor_id,created_at")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("reports")
      .select("id,entity,reason,status,created_at")
      .in("status", ["pending", "reviewing"])
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const gmvMonthCents = (txnsMonth ?? []).reduce((s, t) => s + ((t.amount_cents as number) ?? 0), 0);
  const gmvPrevCents = (txnsPrev ?? []).reduce((s, t) => s + ((t.amount_cents as number) ?? 0), 0);
  const gmvDeltaCents = gmvMonthCents - gmvPrevCents;

  const actorIds = Array.from(
    new Set(
      (auditRows ?? [])
        .map((r) => r.actor_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,username,display_name")
      .in("id", actorIds);
    for (const p of profs ?? []) {
      const label =
        (p.display_name as string | null)?.trim() ||
        ((p.username as string | null) ? `@${p.username as string}` : null) ||
        "Usuario";
      actorNames.set(p.id as string, label);
    }
  }

  const activity: ActivityItem[] = (auditRows ?? [])
    .filter((r) => !AUDIT_HOME_NOISE_ENTITIES.has((r.entity as string) ?? ""))
    .slice(0, 5)
    .map((r) => {
      const entity = (r.entity as string) ?? "—";
      const action = (r.action as string) ?? "—";
      const meta = auditEntityMeta(entity);
      const actorId = r.actor_id as string | null;
      const actorLabel = actorId ? (actorNames.get(actorId) ?? null) : null;
      return {
        id: String(r.id),
        i: meta.icon,
        t: summarizeAuditEvent(entity, action),
        s: auditActivitySubtitle(actorLabel),
        when: relativeTime(r.created_at as string, now),
        tag: meta.tag,
        color: meta.color,
      };
    });

  const queue: ModQueueItem[] = (openReports ?? []).map((r) => ({
    id: r.id as string,
    t: (r.reason as string) ?? "Reporte",
    sev: severityFor((r.entity as string) ?? ""),
  }));

  const { count: openReportsTotal } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "reviewing"]);

  return {
    kpis: {
      mau: profilesCount ?? 0,
      gmvCents: gmvMonthCents,
      gmvDeltaCents,
      clubsActive: clubsActiveCount ?? 0,
      clubsThisWeek: clubsThisWeekCount ?? 0,
      matchesWeek: matchesWeekCount ?? 0,
    },
    activity,
    queue,
    queueTotal: openReportsTotal ?? 0,
  };
}

export async function AdminHome() {
  const data = await loadData();
  return <AdminHomeView data={data} />;
}
