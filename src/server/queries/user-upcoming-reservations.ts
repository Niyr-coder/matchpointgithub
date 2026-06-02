import "server-only";

import {
  isReservationUpcoming,
  parseTstzRange,
} from "@/lib/reservations/during-range";

export type UserUpcomingReservation = {
  id: string;
  during: string;
  courtLabel: string;
  clubLabel: string;
  city: string | null;
  status: string;
};

/** Próximas reservas del jugador (misma regla que tab Próximas en Mis reservas). */
export async function loadUserUpcomingReservations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  limit = 3,
): Promise<UserUpcomingReservation[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select("id,during,sport,status,court_id,club_id,courts(code,name),clubs(name,city)")
    .or(`organizer_id.eq.${userId},for_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[loadUserUpcomingReservations]", error.message);
    return [];
  }

  const now = Date.now();
  return (data ?? [])
    .filter((r: Record<string, unknown>) =>
      isReservationUpcoming(r.during as string, r.status as string, now),
    )
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const sa = parseTstzRange(a.during as string).start?.getTime() ?? 0;
      const sb = parseTstzRange(b.during as string).start?.getTime() ?? 0;
      return sa - sb;
    })
    .slice(0, limit)
    .map((r: Record<string, unknown>) => {
      const court = r.courts as { code?: string; name?: string } | null;
      const club = r.clubs as { name?: string; city?: string } | null;
      return {
        id: r.id as string,
        during: r.during as string,
        courtLabel: court?.name ?? court?.code ?? "Cancha",
        clubLabel: club?.name ?? "",
        city: club?.city ?? null,
        status: r.status as string,
      };
    });
}
