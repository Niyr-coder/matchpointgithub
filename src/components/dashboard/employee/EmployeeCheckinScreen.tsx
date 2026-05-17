// Server: cola de check-ins próximos del club.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { EmployeeCheckinScreenView, type CheckinData, type CheckinQueueRow } from "./EmployeeCheckinScreenView";

function parseRangeStart(during: string): Date | null {
  const m = during.match(/^[[(]"?([^",)]+)/);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d;
}
function parseRangeEnd(during: string): Date | null {
  const m = during.match(/[, ]"?([^",)\]]+)[")\]]$/);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d;
}

function fmtHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function sportLabel(s: string): string {
  if (s === "padel") return "Pádel";
  if (s === "pickleball" || s === "pickle") return "Pickle";
  if (s === "tennis") return "Tenis";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function loadData(): Promise<CheckinData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return { clubId: null, queue: [], upcomingCount: 0 };

  const supabase = await getServerClient();
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(tomorrow.getHours() + 12);

  const { data: reservations } = await supabase
    .from("reservations")
    .select("id,during,sport,source,organizer_id,max_players,courts(code,name)")
    .eq("club_id", clubId)
    .gte("during", now.toISOString())
    .lt("during", tomorrow.toISOString())
    .neq("status", "cancelled")
    .limit(40);

  const sorted = (reservations ?? [])
    .map((r) => ({ r, start: parseRangeStart(r.during as string), end: parseRangeEnd(r.during as string) }))
    .filter((x): x is { r: NonNullable<typeof reservations>[number]; start: Date; end: Date | null } => !!x.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const organizerIds = Array.from(new Set(sorted.map((x) => x.r.organizer_id as string).filter(Boolean)));
  const profNames = new Map<string, string>();
  if (organizerIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", organizerIds);
    for (const p of profs ?? []) profNames.set(p.id as string, p.display_name as string);
  }

  const queue: CheckinQueueRow[] = sorted.map((x) => {
    const court = x.r.courts as { code?: string; name?: string } | null;
    const c = (court?.code ?? court?.name ?? "—").slice(0, 4);
    const durationMin = x.end ? Math.round((x.end.getTime() - x.start.getTime()) / 60000) : null;
    const d = durationMin ? `${durationMin}m` : "—";
    const diffMin = Math.round((x.start.getTime() - now.getTime()) / 60000);
    const st: CheckinQueueRow["st"] =
      x.r.source === "walkin" ? "walkin" : diffMin <= 15 ? "arriving" : "on-time";
    return {
      id: x.r.id as string,
      t: fmtHHMM(x.start),
      n: profNames.get(x.r.organizer_id as string) ?? "Cliente",
      c,
      d,
      code: `${x.r.source === "walkin" ? "WK" : "RV"}-${(x.r.id as string).slice(0, 4).toUpperCase()}`,
      sport: sportLabel(x.r.sport as string),
      st,
      players: (x.r.max_players as number) ?? 0,
    };
  });

  const upcomingCount = queue.filter((r) => r.st !== "walkin").length;

  return { clubId, queue, upcomingCount };
}

export async function EmployeeCheckinScreen() {
  const data = await loadData();
  return <EmployeeCheckinScreenView data={data} />;
}
