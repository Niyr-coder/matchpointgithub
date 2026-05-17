// Server: tickets recientes del club (todos los status).
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { EmployeeSoporteScreenView, type SoporteData, type TicketRow } from "./EmployeeSoporteScreenView";

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

function mapStatus(s: string): TicketRow["st"] {
  if (s === "open") return "open";
  if (s === "in_progress" || s === "waiting_user") return "in-progress";
  return "closed";
}

function mapCategory(c: string): string {
  if (c === "maintenance") return "Mantenimiento";
  if (c === "system") return "Sistema";
  if (c === "customer") return "Cliente";
  if (c === "billing") return "Facturación";
  return "Otro";
}

async function loadData(): Promise<SoporteData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return { clubId: null, tickets: [] };

  const supabase = await getServerClient();
  const now = new Date();

  const { data: tickets } = await supabase
    .from("tickets")
    .select("id,subject,category,status,created_at")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(10);

  const rows: TicketRow[] = (tickets ?? []).map((t) => ({
    id: t.id as string,
    t: (t.subject as string) ?? "Ticket",
    kind: mapCategory((t.category as string) ?? "other"),
    when: relativeTime(t.created_at as string, now),
    st: mapStatus((t.status as string) ?? "open"),
  }));

  return { clubId, tickets: rows };
}

export async function EmployeeSoporteScreen() {
  const data = await loadData();
  return <EmployeeSoporteScreenView data={data} />;
}
