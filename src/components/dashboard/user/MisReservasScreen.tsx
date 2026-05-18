// Server: fetch de todas las reservas del user para la pantalla Mis reservas.
// Trae próximas (during.lower > now y no canceladas), pasadas (during.upper <
// now y completed/checked_in) y canceladas. Joinea con clubs + courts para
// labels legibles.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import {
  MisReservasScreenView,
  type MisReservasData,
  type MisReserva,
} from "./MisReservasScreenView";

async function loadData(): Promise<MisReservasData> {
  const session = await getSession();
  if (!session.authenticated) return { meUserId: null, items: [] };

  const userId = session.session.userId;
  const supabase = await getServerClient();

  const { data: rows } = await supabase
    .from("reservations")
    .select(
      "id,during,status,sport,notes,created_at,cancelled_at,club_id,court_id,clubs(name,city,slug),courts(code,name)",
    )
    .eq("organizer_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const items: MisReserva[] = (rows ?? []).map((r) => {
    const club = r.clubs as { name?: string; city?: string; slug?: string } | null;
    const court = r.courts as { code?: string; name?: string } | null;
    return {
      id: r.id as string,
      during: r.during as string,
      status: r.status as MisReserva["status"],
      sport: r.sport as string,
      notes: (r.notes as string | null) ?? null,
      createdAt: r.created_at as string,
      cancelledAt: (r.cancelled_at as string | null) ?? null,
      clubName: club?.name ?? "Club",
      clubCity: club?.city ?? null,
      clubSlug: club?.slug ?? null,
      courtLabel: court?.name ?? court?.code ?? "Cancha",
    };
  });

  return { meUserId: userId, items };
}

export async function MisReservasScreen() {
  const data = await loadData();
  return <MisReservasScreenView data={data} />;
}
