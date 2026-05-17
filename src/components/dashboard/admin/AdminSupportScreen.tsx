// Server: tickets de soporte abiertos para admin.
import { getServerClient } from "@/lib/db/client.server";
import { AdminSupportScreenView, type SupportData, type TicketRow } from "./AdminSupportScreenView";

function relativeTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} d`;
}

function mapPrio(sev: string): "alta" | "media" | "baja" {
  if (sev === "critical" || sev === "high") return "alta";
  if (sev === "medium") return "media";
  return "baja";
}

async function loadData(): Promise<SupportData> {
  const supabase = await getServerClient();
  const now = new Date();
  const dayAgo = new Date(now);
  dayAgo.setDate(dayAgo.getDate() - 1);

  const { data: tickets } = await supabase
    .from("tickets")
    .select("id,code,subject,category,severity,status,created_at,opener_id,club_id")
    .in("status", ["open", "in_progress", "waiting_user"])
    .order("created_at", { ascending: false })
    .limit(50);

  const openerIds = Array.from(new Set((tickets ?? []).map((t) => t.opener_id as string)));
  const clubIds = Array.from(new Set((tickets ?? []).map((t) => t.club_id as string).filter(Boolean)));

  const [profsRes, clubsRes] = await Promise.all([
    openerIds.length > 0
      ? supabase.from("profiles").select("id,display_name").in("id", openerIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    clubIds.length > 0
      ? supabase.from("clubs").select("id,name").in("id", clubIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const userName = new Map<string, string>();
  for (const p of profsRes.data ?? []) userName.set(p.id as string, p.display_name as string);
  const clubName = new Map<string, string>();
  for (const c of clubsRes.data ?? []) clubName.set(c.id as string, c.name as string);

  const rows: TicketRow[] = (tickets ?? []).map((t) => {
    const who = t.club_id
      ? clubName.get(t.club_id as string) ?? "Club"
      : userName.get(t.opener_id as string) ?? "Usuario";
    return {
      id: `#${(t.code as string) ?? (t.id as string).slice(0, 8).toUpperCase()}`,
      who,
      subj: (t.subject as string) ?? "Ticket",
      when: relativeTime(t.created_at as string, now),
      prio: mapPrio((t.severity as string) ?? "medium"),
      cat: (t.category as string) ?? "—",
    };
  });

  const slaAtRisk = (tickets ?? []).filter(
    (t) => new Date(t.created_at as string) < dayAgo && ["critical", "high"].includes(t.severity as string),
  ).length;
  const altaCount = rows.filter((r) => r.prio === "alta").length;
  const mediaCount = rows.filter((r) => r.prio === "media").length;
  const bajaCount = rows.filter((r) => r.prio === "baja").length;

  return {
    rows,
    openCount: rows.length,
    kpis: { slaAtRisk, altaCount, mediaCount, bajaCount },
  };
}

export async function AdminSupportScreen() {
  const data = await loadData();
  return <AdminSupportScreenView data={data} />;
}
