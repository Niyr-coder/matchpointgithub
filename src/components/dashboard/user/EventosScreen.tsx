// Server: fetch tournaments (todos los estados) + registrations del user.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { TournamentFeaturedSchema, type TournamentFeatured } from "@/lib/schemas/tournaments";
import { EventosScreenClient } from "./EventosScreenClient";

export async function EventosScreen() {
  // Resolvemos sesión una sola vez y compartimos el cliente Supabase entre
  // ambas queries. La versión previa llamaba getSession()+getServerClient()
  // dentro de cada helper, lo que costaba 2 viajes a auth.getUser() y 3
  // instancias del client por render.
  const session = await getSession();
  const userId = session.authenticated ? session.session.userId : null;
  const supabase = await getServerClient();

  const tournamentsPromise = supabase
    .from("tournaments_public_summary")
    .select("*")
    .order("is_featured", { ascending: false })
    .order("starts_at", { ascending: true })
    .limit(60);

  const myRegisteredPromise = userId
    ? supabase
        .from("registrations")
        .select("tournament_id")
        .contains("player_ids", [userId])
        .in("status", ["pending", "accepted"])
    : Promise.resolve({ data: [] as { tournament_id: string }[] });

  // MPR propio para el aviso de rango en el modal de categoria (escala /1000).
  const myRatingPromise = userId
    ? supabase.from("player_stats").select("current_rating").eq("user_id", userId).maybeSingle()
    : Promise.resolve({ data: null as { current_rating: number | null } | null });

  const [tournamentsRes, myRegisteredRes, myRatingRes] = await Promise.all([
    tournamentsPromise,
    myRegisteredPromise,
    myRatingPromise,
  ]);
  const myMpr = myRatingRes.data?.current_rating != null
    ? (myRatingRes.data.current_rating as number) / 1000
    : null;

  const tournaments: TournamentFeatured[] = (tournamentsRes.data ?? [])
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
          isFeatured: (row.is_featured as boolean | null | undefined) ?? false,
        });
      } catch {
        return null;
      }
    })
    .filter((t): t is TournamentFeatured => t != null);

  const myRegisteredIds = (myRegisteredRes.data ?? []).map(
    (r) => r.tournament_id as string,
  );

  return (
    <EventosScreenClient
      tournaments={tournaments}
      myRegisteredIds={myRegisteredIds}
      userId={userId}
      myMpr={myMpr}
    />
  );
}
