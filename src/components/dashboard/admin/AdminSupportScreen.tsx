// Server: cola abierta + historial de tickets para admin.
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

type RawTicket = {
  id: string;
  code: string | null;
  subject: string | null;
  category: string | null;
  severity: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  opener_id: string;
  club_id: string | null;
  assignee_id: string | null;
};

function mapRows(
  tickets: RawTicket[],
  userName: Map<string, string>,
  clubName: Map<string, string>,
  now: Date,
): TicketRow[] {
  return tickets.map((t) => {
    const who = t.club_id
      ? clubName.get(t.club_id) ?? "Club"
      : userName.get(t.opener_id) ?? "Usuario";
    return {
      ticketId: t.id,
      assigneeId: t.assignee_id,
      id: `#${t.code ?? t.id.slice(0, 8).toUpperCase()}`,
      who,
      subj: t.subject ?? "Ticket",
      when: relativeTime(t.created_at, now),
      updatedWhen: relativeTime(t.updated_at, now),
      prio: mapPrio(t.severity ?? "medium"),
      cat: t.category ?? "—",
      status: t.status as TicketRow["status"],
    };
  });
}

async function loadLookupMaps(supabase: Awaited<ReturnType<typeof getServerClient>>, tickets: RawTicket[]) {
  const openerIds = Array.from(new Set(tickets.map((t) => t.opener_id)));
  const clubIds = Array.from(new Set(tickets.map((t) => t.club_id).filter(Boolean) as string[]));

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

  return { userName, clubName };
}

async function loadData(): Promise<SupportData> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const now = new Date();
  const dayAgo = new Date(now);
  dayAgo.setDate(dayAgo.getDate() - 1);

  const [openRes, historyRes] = await Promise.all([
    supabase
      .from("tickets")
      .select("id,code,subject,category,severity,status,created_at,updated_at,opener_id,club_id,assignee_id")
      .in("status", ["open", "in_progress", "waiting_user"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("tickets")
      .select("id,code,subject,category,severity,status,created_at,updated_at,opener_id,club_id,assignee_id")
      .in("status", ["resolved", "closed"])
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  const openTickets = (openRes.data ?? []) as RawTicket[];
  const historyTickets = (historyRes.data ?? []) as RawTicket[];
  const allTickets = [...openTickets, ...historyTickets];

  const { userName, clubName } = await loadLookupMaps(supabase, allTickets);

  const rows = mapRows(openTickets, userName, clubName, now);
  const historyRows = mapRows(historyTickets, userName, clubName, now);

  const slaAtRisk = openTickets.filter(
    (t) => new Date(t.created_at) < dayAgo && ["critical", "high"].includes(t.severity ?? ""),
  ).length;
  const altaCount = rows.filter((r) => r.prio === "alta").length;
  const mediaCount = rows.filter((r) => r.prio === "media").length;
  const bajaCount = rows.filter((r) => r.prio === "baja").length;

  return {
    rows,
    historyRows,
    openCount: rows.length,
    historyCount: historyRows.length,
    currentAdminId: user?.id ?? "",
    kpis: { slaAtRisk, altaCount, mediaCount, bajaCount },
  };
}

async function readSearchParams(searchParams?: Promise<Record<string, string | string[] | undefined>>) {
  if (!searchParams) return { focus: null as string | null, view: "open" as "open" | "history" };
  const sp = await searchParams;
  const focusRaw = sp?.focus;
  const viewRaw = sp?.view;
  const focus = typeof focusRaw === "string" && focusRaw.length > 0 ? focusRaw : null;
  const view = viewRaw === "history" ? "history" : "open";
  return { focus, view };
}

export async function AdminSupportScreen({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [data, sp] = await Promise.all([loadData(), readSearchParams(searchParams)]);
  const initialView =
    sp.view === "history" ||
    (sp.focus != null && data.historyRows.some((r) => r.ticketId === sp.focus))
      ? "history"
      : "open";

  return (
    <AdminSupportScreenView
      data={data}
      initialFocusTicketId={sp.focus}
      initialView={initialView}
    />
  );
}
