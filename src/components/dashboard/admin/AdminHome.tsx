// Server: home del admin con KPIs globales reales + actividad reciente desde audit_log.
import { getServerClient } from "@/lib/db/client.server";
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

const ENTITY_META: Record<string, { tag: string; color: string; icon: string }> = {
  clubs: { tag: "CLUB", color: "#0ea5e9", icon: "building-2" },
  events: { tag: "EVENTO", color: "#fbbf24", icon: "trophy" },
  tournaments: { tag: "TORNEO", color: "#fbbf24", icon: "trophy" },
  transactions: { tag: "PAGO", color: "#10b981", icon: "wallet" },
  reports: { tag: "MOD", color: "#dc2626", icon: "alert-triangle" },
  profiles: { tag: "USERS", color: "#7c3aed", icon: "user-plus" },
  reservations: { tag: "RESERVA", color: "var(--primary)", icon: "calendar-check" },
  tickets: { tag: "SOPORTE", color: "#0ea5e9", icon: "life-buoy" },
};

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
      .limit(5),
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

  const activity: ActivityItem[] = (auditRows ?? []).map((r) => {
    const entity = (r.entity as string) ?? "—";
    const meta = ENTITY_META[entity] ?? { tag: entity.toUpperCase(), color: "var(--muted-fg)", icon: "circle" };
    return {
      id: String(r.id),
      i: meta.icon,
      t: `${entity}.${(r.action as string).toLowerCase()}`,
      s: (r.entity_id as string | null) ? `id: ${(r.entity_id as string).slice(0, 8)}` : "—",
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
