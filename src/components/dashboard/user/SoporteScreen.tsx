// Server: pantalla de Soporte del jugador. Identidad real + tickets del usuario.
import { getSession } from "@/lib/auth/session";
import { getProfileSummary, isPlanActive } from "@/lib/auth/profile";
import { getServerClient } from "@/lib/db/client.server";
import { mapPlayerTicketRow, type PlayerTicketRow } from "@/lib/support/ticket-display";
import { mapTicket } from "@/lib/support/ticket-map";
import { SoporteScreenView } from "./SoporteScreenView";

async function loadPlayerTickets(userId: string): Promise<PlayerTicketRow[]> {
  const supabase = await getServerClient();
  const now = new Date();
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("opener_id", userId)
    .is("club_id", null)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return (data ?? []).map((row) => mapPlayerTicketRow(mapTicket(row), now));
}

async function loadMaintenanceActive(): Promise<boolean> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("feature_flags")
    .select("enabled_default")
    .eq("key", "maintenance_banner")
    .maybeSingle();
  return data?.enabled_default === true;
}

export async function SoporteScreen() {
  const session = await getSession();
  if (!session.authenticated) {
    return (
      <SoporteScreenView
        email={null}
        userId={null}
        planLabel="Jugador (free)"
        isPremium={false}
        tickets={[]}
        maintenanceActive={false}
      />
    );
  }

  const { userId, email } = session.session;
  const [summary, tickets, maintenanceActive] = await Promise.all([
    getProfileSummary(userId),
    loadPlayerTickets(userId),
    loadMaintenanceActive(),
  ]);
  const { tier } = isPlanActive(summary);
  const isPremium = tier === "premium";

  return (
    <SoporteScreenView
      email={email}
      userId={userId}
      planLabel={isPremium ? "MATCHPOINT+ (premium)" : "Jugador (free)"}
      isPremium={isPremium}
      tickets={tickets}
      maintenanceActive={maintenanceActive}
    />
  );
}
