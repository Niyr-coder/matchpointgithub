// Server: fetch tournaments (todos los estados) + registrations del user.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { TournamentFeaturedSchema, type TournamentFeatured } from "@/lib/schemas/tournaments";
import { EventosScreenClient } from "./EventosScreenClient";

async function fetchTournaments(): Promise<TournamentFeatured[]> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("tournaments_public_summary")
    .select("*")
    .order("starts_at", { ascending: true })
    .limit(60);
  if (!data) return [];
  return data
    .map((row) => {
      try {
        return TournamentFeaturedSchema.parse({
          id: row.id,
          slug: row.slug,
          name: row.name,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          prizePoolCents: row.prize_pool_cents ?? null,
          entryFeeCents: row.entry_fee_cents ?? 0,
          currency: row.currency ?? null,
          maxParticipants: row.max_participants ?? null,
          sport: row.sport,
          format: row.format,
          status: row.status,
          clubName: row.club_name ?? null,
          clubCity: row.club_city ?? null,
          registrationsCount: row.registrations_count ?? 0,
        });
      } catch {
        return null;
      }
    })
    .filter((t): t is TournamentFeatured => t != null);
}

async function fetchMyRegisteredIds(): Promise<string[]> {
  const session = await getSession();
  if (!session.authenticated) return [];
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("registrations")
    .select("tournament_id")
    .contains("player_ids", [session.session.userId])
    .in("status", ["pending", "accepted"]);
  return (data ?? []).map((r) => r.tournament_id as string);
}

export async function EventosScreen() {
  const session = await getSession();
  const userId = session.authenticated ? session.session.userId : null;
  const [tournaments, myRegisteredIds] = await Promise.all([
    fetchTournaments(),
    fetchMyRegisteredIds(),
  ]);
  return (
    <EventosScreenClient
      tournaments={tournaments}
      myRegisteredIds={myRegisteredIds}
      userId={userId}
    />
  );
}
