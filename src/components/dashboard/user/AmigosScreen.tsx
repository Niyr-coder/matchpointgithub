// Server: fetch friendships + friend_requests + sugerencias (profiles en misma city).
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary, isPlanActive } from "@/lib/auth/profile";
import { AmigosScreenView, type FriendLite, type RequestLite } from "./AmigosScreenView";

const SUGGESTIONS_LIMIT = 12;
const FALLBACK_RATING = 2500;
const SPORT_PRIMARY = "pickleball" as const;

function levelFromRating(elo: number | null | undefined): number {
  return Math.round(((elo ?? FALLBACK_RATING) / 1000) * 10) / 10;
}

function sportLabel(s: string | null | undefined): string {
  if (s === "tennis") return "Tenis";
  if (s === "padel") return "Pádel";
  return "Pickleball";
}

type FriendStats = {
  matchesTogether: number;
  h2hWins: number;
  h2hLosses: number;
  teamWins: number;
  teamLosses: number;
  lastPlayedAt: string | null;
};

function emptyFriendStats(): FriendStats {
  return {
    matchesTogether: 0,
    h2hWins: 0,
    h2hLosses: 0,
    teamWins: 0,
    teamLosses: 0,
    lastPlayedAt: null,
  };
}

function winnerFromScore(score: unknown): "a" | "b" | null {
  if (!score || typeof score !== "object") return null;
  const winner = (score as { winner?: unknown }).winner;
  return winner === "a" || winner === "b" ? winner : null;
}

async function loadData() {
  const session = await getSession();
  const supabase = await getServerClient();

  if (!session.authenticated) {
    return {
      friends: [],
      requests: [],
      suggestions: [],
      myCity: null as string | null,
      myLevel: null as number | null,
      meUserId: null as string | null,
      viewerIsPremium: false,
    };
  }

  const userId = session.session.userId;

  // myCity viene del cache del layout (getProfileSummary). Las otras dos
  // queries no tienen alternativa cacheada.
  const [
    myProfile,
    { data: friendships },
    { data: requests },
  ] = await Promise.all([
    getProfileSummary(userId),
    supabase
      .from("friendships")
      .select("user_a,user_b,since")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .limit(500),
    supabase
      .from("friend_requests")
      .select("id,from_user_id,created_at")
      .eq("to_user_id", userId)
      .eq("status", "pending")
      .limit(100),
  ]);

  const myCity = myProfile.city;
  const viewerIsPremium = isPlanActive(myProfile).tier === "premium";
  const friendIds = (friendships ?? []).map((f) =>
    (f.user_a as string) === userId ? (f.user_b as string) : (f.user_a as string),
  );
  const sinceById = new Map<string, string>();
  for (const friendship of friendships ?? []) {
    const friendId =
      (friendship.user_a as string) === userId
        ? (friendship.user_b as string)
        : (friendship.user_a as string);
    sinceById.set(friendId, friendship.since as string);
  }
  const requesterIds = (requests ?? []).map((r) => r.from_user_id as string);

  const exclude = new Set<string>([userId, ...friendIds, ...requesterIds]);

  // Fetch profiles for friends + requesters in one query. Incluye is_system
  // para que la card de MATCHPOINT renderice con banner+logo oficial.
  const idsToFetch = [...friendIds, ...requesterIds];
  const { data: profiles } =
    idsToFetch.length > 0
      ? await supabase
          .from("profiles")
          .select(
            "id,display_name,username,avatar_url,city,preferred_sport,is_system,plan_tier,plan_expires_at" as never,
          )
          .in("id", idsToFetch)
      : { data: [] };

  // Stats for those profiles (rating).
  const statIds = [...new Set([...idsToFetch, userId])];
  const { data: stats } =
    statIds.length > 0
      ? await supabase
          .from("player_stats")
          .select("user_id,current_rating")
          .in("user_id", statIds)
          .eq("sport", SPORT_PRIMARY)
      : { data: [] };

  const profilesTyped = (profiles ?? []) as unknown as Array<Record<string, unknown>>;
  const profileMap = new Map(profilesTyped.map((p) => [p.id as string, p]));
  const ratingMap = new Map(
    (stats ?? []).map((s) => [s.user_id as string, s.current_rating as number]),
  );
  const myLevel = levelFromRating(ratingMap.get(userId));

  const friendStatsById = new Map<string, FriendStats>();
  for (const id of friendIds) friendStatsById.set(id, emptyFriendStats());

  if (friendIds.length > 0) {
    const { data: rawMatches } = await supabase
      .from("matches")
      .select("id,played_at,team_a_player_ids,team_b_player_ids,score")
      .eq("status", "confirmed")
      .or(`team_a_player_ids.cs.{${userId}},team_b_player_ids.cs.{${userId}}`)
      .order("played_at", { ascending: false })
      .limit(200);

    type RawMatch = {
      played_at: string;
      team_a_player_ids: string[] | null;
      team_b_player_ids: string[] | null;
      score: unknown;
    };

    for (const match of (rawMatches ?? []) as unknown as RawMatch[]) {
      const teamA = match.team_a_player_ids ?? [];
      const teamB = match.team_b_player_ids ?? [];
      const meOnA = teamA.includes(userId);
      const meOnB = teamB.includes(userId);
      if (!meOnA && !meOnB) continue;
      const winner = winnerFromScore(match.score);
      const myTeam = meOnA ? "a" : "b";

      for (const friendId of friendIds) {
        const friendOnA = teamA.includes(friendId);
        const friendOnB = teamB.includes(friendId);
        if (!friendOnA && !friendOnB) continue;

        const current = friendStatsById.get(friendId) ?? emptyFriendStats();
        const sameTeam = (meOnA && friendOnA) || (meOnB && friendOnB);
        current.matchesTogether += 1;
        if (!current.lastPlayedAt || new Date(match.played_at) > new Date(current.lastPlayedAt)) {
          current.lastPlayedAt = match.played_at;
        }

        if (winner) {
          if (sameTeam) {
            if (winner === myTeam) current.teamWins += 1;
            else current.teamLosses += 1;
          } else if (winner === myTeam) {
            current.h2hWins += 1;
          } else {
            current.h2hLosses += 1;
          }
        }
        friendStatsById.set(friendId, current);
      }
    }
  }

  // Premium activo: plan_tier=premium AND (plan_expires_at null OR future).
  // Mismo criterio que isPlanActive de lib/auth/profile, evaluado per profile.
  function deriveIsPremium(p: { plan_tier?: unknown; plan_expires_at?: unknown }): boolean {
    if (p.plan_tier !== "premium") return false;
    const exp = p.plan_expires_at;
    if (exp === null || exp === undefined) return true;
    return new Date(exp as string).getTime() > Date.now();
  }

  const friends: FriendLite[] = friendIds
    .map((id) => {
      const p = profileMap.get(id) as Record<string, unknown> | undefined;
      if (!p) return null;
      return {
        id,
        name: (p.display_name as string) ?? "Jugador",
        username: (p.username as string | null | undefined) ?? null,
        avatarUrl: (p.avatar_url as string | null | undefined) ?? null,
        city: (p.city as string | null) ?? "—",
        sport: sportLabel(p.preferred_sport as string | null),
        level: levelFromRating(ratingMap.get(id)),
        isOfficial: p.is_system === true,
        isPremium: deriveIsPremium(p),
        friendSince: sinceById.get(id) ?? null,
        ...(friendStatsById.get(id) ?? emptyFriendStats()),
      };
    })
    .filter((f): f is NonNullable<typeof f> => f != null);

  const requestsList: RequestLite[] = (requests ?? [])
    .map((r) => {
      const p = profileMap.get(r.from_user_id as string) as Record<string, unknown> | undefined;
      if (!p) return null;
      return {
        id: r.id as string,
        fromUserId: r.from_user_id as string,
        name: (p.display_name as string) ?? "Jugador",
        username: (p.username as string | null | undefined) ?? null,
        avatarUrl: (p.avatar_url as string | null | undefined) ?? null,
        city: (p.city as string | null) ?? "—",
        sport: sportLabel(p.preferred_sport as string | null),
        level: levelFromRating(ratingMap.get(r.from_user_id as string)),
        isOfficial: p.is_system === true,
        isPremium: deriveIsPremium(p),
        createdAt: (r.created_at as string | null | undefined) ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  // Sugerencias: profiles en misma city que no estén ya en friends/requests.
  let suggestions: FriendLite[] = [];
  if (myCity) {
    const { data: candidatesRaw } = await supabase
      .from("v_public_profiles")
      .select(
        "id,display_name,username,avatar_url,city,preferred_sport,is_system" as never,
      )
      .eq("city", myCity)
      .eq("is_system" as never, false as never)
      .limit(SUGGESTIONS_LIMIT * 3);
    const candidates = (candidatesRaw ?? []) as unknown as Array<Record<string, unknown>>;
    const candidateIds = candidates
      .map((c) => c.id as string)
      .filter((id) => !exclude.has(id));
    const { data: candStats } =
      candidateIds.length > 0
        ? await supabase
            .from("player_stats")
            .select("user_id,current_rating")
            .in("user_id", candidateIds)
            .eq("sport", SPORT_PRIMARY)
        : { data: [] };
    const candRatingMap = new Map(
      (candStats ?? []).map((s) => [s.user_id as string, s.current_rating as number]),
    );
    suggestions = candidates
      .filter((c) => !exclude.has(c.id as string))
      .slice(0, SUGGESTIONS_LIMIT)
      .map((c) => {
        return {
          id: c.id as string,
          name: (c.display_name as string) ?? "Jugador",
          username: (c.username as string | null | undefined) ?? null,
          avatarUrl: (c.avatar_url as string | null | undefined) ?? null,
          city: (c.city as string | null) ?? "—",
          sport: sportLabel(c.preferred_sport as string | null),
          level: levelFromRating(candRatingMap.get(c.id as string)),
          isOfficial: false,
          isPremium: false,
        };
      });
  }

  return { friends, requests: requestsList, suggestions, myCity, myLevel, meUserId: userId, viewerIsPremium };
}

export async function AmigosScreen() {
  const data = await loadData();
  return <AmigosScreenView {...data} />;
}
