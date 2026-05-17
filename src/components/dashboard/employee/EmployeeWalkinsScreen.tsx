// Server: walk-ins en cola + disponibilidad de canchas del club.
// Compartido por manager (club-walkins) y employee (e-walkins).
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import {
  EmployeeWalkinsScreenView,
  type WalkinsData,
  type WalkinRow,
  type CourtRow,
} from "./EmployeeWalkinsScreenView";

function relativeWait(iso: string, now: Date): string {
  const created = new Date(iso);
  const mins = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 60000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h`;
}

function parseRangeEnd(during: string): Date | null {
  const m = during.match(/[, ]"?([^",)\]]+)[")\]]$/);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d.getTime()) ? null : d;
}

function sportLabel(s: string | null): string {
  if (!s) return "—";
  if (s === "padel") return "Pádel";
  if (s === "pickleball") return "Pickleball";
  if (s === "tennis") return "Tenis";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function loadData(): Promise<WalkinsData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) {
    return { clubId: null, queue: [], courts: [] };
  }

  const supabase = await getServerClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [{ data: walkins }, { data: courts }, { data: liveReservations }] = await Promise.all([
    supabase
      .from("walkins")
      .select("id,customer_name,customer_phone,party_size,duration_minutes,created_at,court_id,created_reservation_id,courts(sport)")
      .eq("club_id", clubId)
      .is("created_reservation_id", null)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: true })
      .limit(20),
    supabase
      .from("courts")
      .select("id,code,name,sport")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("ordinal"),
    supabase
      .from("reservations")
      .select("court_id,during,source")
      .eq("club_id", clubId)
      .neq("status", "cancelled")
      .gte("during", new Date(now.getTime() - 3 * 3600 * 1000).toISOString())
      .lt("during", new Date(now.getTime() + 6 * 3600 * 1000).toISOString()),
  ]);

  const queue: WalkinRow[] = (walkins ?? []).map((w) => {
    const court = w.courts as { sport?: string } | null;
    return {
      id: w.id as string,
      n: (w.customer_name as string) ?? "Walk-in",
      t: relativeWait(w.created_at as string, now),
      sport: sportLabel(court?.sport ?? null),
      players: (w.party_size as number) ?? 2,
      dur: `${(w.duration_minutes as number) ?? 60}m`,
      phone: (w.customer_phone as string | null) ?? "—",
      notes: "—",
    };
  });

  // Determinar estado live por cancha.
  type CourtState = "free" | "busy" | "class";
  const occupancy = new Map<string, { end: Date; source: string }>();
  for (const r of liveReservations ?? []) {
    const end = parseRangeEnd(r.during as string);
    if (!end || end < now) continue;
    const start = (() => {
      const m = (r.during as string).match(/^[[(]"?([^",)]+)/);
      return m ? new Date(m[1]) : null;
    })();
    if (!start) continue;
    if (start > now) continue; // future, no afecta "ahora"
    const curr = occupancy.get(r.court_id as string);
    if (!curr || end > curr.end) {
      occupancy.set(r.court_id as string, { end, source: r.source as string });
    }
  }

  const courtList: CourtRow[] = (courts ?? []).map((c) => {
    const occ = occupancy.get(c.id as string);
    const status: CourtState = !occ
      ? "free"
      : occ.source === "class"
      ? "class"
      : "busy";
    const untilStr = occ
      ? `${String(occ.end.getHours()).padStart(2, "0")}:${String(occ.end.getMinutes()).padStart(2, "0")}`
      : "—";
    return {
      id: c.id as string,
      n: (c.name as string) ?? (c.code as string) ?? "Cancha",
      sport: sportLabel(c.sport as string),
      status,
      until: untilStr,
    };
  });

  return { clubId, queue, courts: courtList };
}

export async function EmployeeWalkinsScreen() {
  const data = await loadData();
  return <EmployeeWalkinsScreenView data={data} />;
}
