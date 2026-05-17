// Server: audit_log de la plataforma (admin scope).
import { getServerClient } from "@/lib/db/client.server";
import { AdminAuditScreenView, type AuditData, type LogEntry } from "./AdminAuditScreenView";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

async function loadData(): Promise<AuditData> {
  const supabase = await getServerClient();

  const { data: logs } = await supabase
    .from("audit_log")
    .select("id,actor_id,actor_role,entity,entity_id,action,ip,created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  const actorIds = Array.from(
    new Set((logs ?? []).map((l) => l.actor_id as string | null).filter(Boolean) as string[]),
  );
  const actorName = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,username,display_name")
      .in("id", actorIds);
    for (const p of profs ?? []) {
      actorName.set(p.id as string, `@${(p.username as string) ?? (p.display_name as string)}`);
    }
  }

  const rows: LogEntry[] = (logs ?? []).map((l) => ({
    id: String(l.id),
    t: fmtTime(l.created_at as string),
    who: l.actor_id ? actorName.get(l.actor_id as string) ?? "—" : "sistema",
    action: `${(l.entity as string) ?? "—"}.${((l.action as string) ?? "—").toLowerCase()}`,
    target: (l.entity_id as string | null) ? (l.entity_id as string).slice(0, 12) : "—",
    ip: (l.ip as string | null) ?? "—",
  }));

  return { rows };
}

export async function AdminAuditScreen() {
  const data = await loadData();
  return <AdminAuditScreenView data={data} />;
}
