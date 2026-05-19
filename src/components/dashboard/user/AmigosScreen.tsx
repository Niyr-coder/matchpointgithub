// Server: fetch friendships + friend_requests + sugerencias (profiles en misma city).
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
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

async function loadData() {
  const session = await getSession();
  const supabase = await getServerClient();

  if (!session.authenticated) {
    return { friends: [], requests: [], suggestions: [], myCity: null as string | null, meUserId: null as string | null };
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
  const friendIds = (friendships ?? []).map((f) =>
    (f.user_a as string) === userId ? (f.user_b as string) : (f.user_a as string),
  );
  const requesterIds = (requests ?? []).map((r) => r.from_user_id as string);

  const exclude = new Set<string>([userId, ...friendIds, ...requesterIds]);

  // Fetch profiles for friends + requesters in one query.
  const idsToFetch = [...friendIds, ...requesterIds];
  const { data: profiles } =
    idsToFetch.length > 0
      ? await supabase
          .from("profiles")
          .select("id,display_name,city,preferred_sport")
          .in("id", idsToFetch)
      : { data: [] };

  // Stats for those profiles (rating).
  const { data: stats } =
    idsToFetch.length > 0
      ? await supabase
          .from("player_stats")
          .select("user_id,current_rating")
          .in("user_id", idsToFetch)
          .eq("sport", SPORT_PRIMARY)
      : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  const ratingMap = new Map(
    (stats ?? []).map((s) => [s.user_id as string, s.current_rating as number]),
  );

  const friends: FriendLite[] = friendIds
    .map((id) => {
      const p = profileMap.get(id);
      if (!p) return null;
      return {
        id,
        name: (p.display_name as string) ?? "Jugador",
        city: (p.city as string | null) ?? "—",
        sport: sportLabel(p.preferred_sport as string | null),
        level: levelFromRating(ratingMap.get(id)),
      };
    })
    .filter((f): f is FriendLite => f != null);

  const requestsList: RequestLite[] = (requests ?? [])
    .map((r) => {
      const p = profileMap.get(r.from_user_id as string);
      if (!p) return null;
      return {
        id: r.id as string,
        fromUserId: r.from_user_id as string,
        name: (p.display_name as string) ?? "Jugador",
        city: (p.city as string | null) ?? "—",
        sport: sportLabel(p.preferred_sport as string | null),
        level: levelFromRating(ratingMap.get(r.from_user_id as string)),
      };
    })
    .filter((r): r is RequestLite => r != null);

  // Sugerencias: profiles en misma city que no estén ya en friends/requests.
  let suggestions: FriendLite[] = [];
  if (myCity) {
    const { data: candidates } = await supabase
      .from("profiles")
      .select("id,display_name,city,preferred_sport")
      .eq("city", myCity)
      .limit(SUGGESTIONS_LIMIT * 3);
    const candidateIds = (candidates ?? [])
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
    suggestions = (candidates ?? [])
      .filter((c) => !exclude.has(c.id as string))
      .slice(0, SUGGESTIONS_LIMIT)
      .map((c) => ({
        id: c.id as string,
        name: (c.display_name as string) ?? "Jugador",
        city: (c.city as string | null) ?? "—",
        sport: sportLabel(c.preferred_sport as string | null),
        level: levelFromRating(candRatingMap.get(c.id as string)),
      }));
  }

  return { friends, requests: requestsList, suggestions, myCity, meUserId: userId };
}

export async function AmigosScreen() {
  const data = await loadData();
  return <AmigosScreenView {...data} />;
}
