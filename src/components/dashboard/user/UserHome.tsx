// Server: fetch profile + stats + reservations + torneos + history.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary, isPlanActive } from "@/lib/auth/profile";
import { listFeaturedTournaments } from "@/server/actions/tournaments";
import { UserHomeView, type UserHomeData } from "./UserHomeView";

const STARTING_RATING = 2500;
const SPORT_PRIMARY = "pickleball" as const;

async function loadData(): Promise<UserHomeData> {
  const session = await getSession();
  const supabase = await getServerClient();

  if (!session.authenticated) {
    const tournaments = await listFeaturedTournaments({ limit: 3 });
    return {
      meUserId: null,
      name: "Invitado",
      onboardedAt: null,
      currentRating: STARTING_RATING,
      rank: null,
      matchesTotal: 0,
      reservations: [],
      tournaments: tournaments.ok ? tournaments.data : [],
      ratingHistory: [],
      planTier: "free",
      planExpiresAt: null,
    };
  }

  const userId = session.session.userId;

  const [
    profile,
    { data: stats },
    { data: rankRows },
    { data: reservations },
    tournamentsRes,
    { data: history },
  ] = await Promise.all([
    // getProfileSummary está cacheado por request: si [role]/layout.tsx ya lo
    // pidió en el mismo render, esto no dispara query extra.
    getProfileSummary(userId),
    supabase
      .from("player_stats")
      .select("matches_total,current_rating")
      .eq("user_id", userId)
      .eq("sport", SPORT_PRIMARY)
      .maybeSingle(),
    supabase
      .from("mv_user_ranking")
      .select("rank,sport")
      .eq("user_id", userId)
      .eq("sport", SPORT_PRIMARY),
    supabase
      .from("reservations")
      .select("id,during,sport,status,court_id,club_id,courts(code,name),clubs(name,city)")
      .eq("organizer_id", userId)
      .gte("during", new Date().toISOString())
      .eq("status", "booked")
      .order("during", { ascending: true })
      .limit(3),
    listFeaturedTournaments({ limit: 3 }),
    supabase
      .from("ranking_snapshots")
      .select("rating,snapshot_at")
      .eq("user_id", userId)
      .eq("sport", SPORT_PRIMARY)
      .order("snapshot_at", { ascending: true })
      .limit(8),
  ]);

  const reservationsAdapted = (reservations ?? []).map((r: Record<string, unknown>) => {
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

  const ratingHistory = (history ?? []).map((h: Record<string, unknown>) => ({
    rating: h.rating as number,
    snapshotAt: h.snapshot_at as string,
  }));

  const { tier: effectiveTier } = isPlanActive(profile);

  return {
    meUserId: userId,
    name: profile.displayName ?? "Jugador",
    onboardedAt: profile.onboardedAt,
    currentRating: (stats?.current_rating as number | undefined) ?? STARTING_RATING,
    rank: (rankRows?.[0]?.rank as number | undefined) ?? null,
    matchesTotal: (stats?.matches_total as number | undefined) ?? 0,
    reservations: reservationsAdapted,
    tournaments: tournamentsRes.ok ? tournamentsRes.data : [],
    ratingHistory,
    planTier: effectiveTier,
    planExpiresAt: profile.planExpiresAt,
  };
}

export async function UserHome() {
  const data = await loadData();
  return <UserHomeView data={data} />;
}
