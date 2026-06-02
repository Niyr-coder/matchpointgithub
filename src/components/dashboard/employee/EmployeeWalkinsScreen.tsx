// Server: walk-ins en cola + disponibilidad de canchas del club.
// Compartido por manager (club-walkins) y employee (e-walkins).
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { loadCourtOccupancy } from "@/server/queries/court-occupancy";
import {
  EmployeeWalkinsScreenView,
  type WalkinsData,
  type WalkinRow,
} from "./EmployeeWalkinsScreenView";

function relativeWait(iso: string, now: Date): string {
  const created = new Date(iso);
  const mins = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 60000));
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h`;
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
    return {
      clubId: null,
      queue: [],
      courts: [],
      occupancy: null,
    };
  }

  const supabase = await getServerClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [{ data: walkins }, occupancy] = await Promise.all([
    supabase
      .from("walkins")
      .select(
        "id,customer_name,customer_phone,party_size,duration_minutes,sport,notes,created_at,court_id,created_reservation_id,courts(sport)",
      )
      .eq("club_id", clubId)
      .is("created_reservation_id", null)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: true })
      .limit(20),
    loadCourtOccupancy(supabase, clubId),
  ]);

  const queue: WalkinRow[] = (walkins ?? []).map((w) => {
    const court = w.courts as { sport?: string } | null;
    const sportRaw = (w.sport as string | null) ?? court?.sport ?? null;
    return {
      id: w.id as string,
      n: (w.customer_name as string) ?? "Walk-in",
      t: relativeWait(w.created_at as string, now),
      sport: sportLabel(sportRaw),
      sportRaw,
      players: (w.party_size as number) ?? 2,
      dur: `${(w.duration_minutes as number) ?? 60}m`,
      durationMinutes: (w.duration_minutes as number) ?? 60,
      phone: (w.customer_phone as string | null) ?? "—",
      notes: (w.notes as string | null)?.trim() || "—",
    };
  });

  return {
    clubId,
    queue,
    courts: occupancy.courts,
    occupancy,
  };
}

export async function EmployeeWalkinsScreen() {
  const data = await loadData();
  return <EmployeeWalkinsScreenView data={data} />;
}
