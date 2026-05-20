// Server: fetch friendships + friend_requests + sugerencias (profiles en misma city).
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { findAccent, findCardStyle } from "@/lib/profile/customization-presets";
import { canUsePreset } from "@/lib/profile/bundles";
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

  // Fetch profiles for friends + requesters in one query. Incluye is_system
  // para que la card de MATCHPOINT renderice con banner+logo oficial.
  // Customización: accent_color + card_style se traen también — el
  // FriendCard de cada amigo aplica el card_style del PROPIO amigo (mig 115
  // abrió SELECT a todos para que esto sea posible sin admin client).
  const idsToFetch = [...friendIds, ...requesterIds];
  const { data: profiles } =
    idsToFetch.length > 0
      ? await supabase
          .from("profiles")
          .select(
            "id,display_name,username,city,preferred_sport,is_system,plan_tier,plan_expires_at,accent_color,card_style" as never,
          )
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

  // Cosmetic grants for ALL relevant users (friends + requesters + later suggestions).
  // mig 115 abrió SELECT al public auth.
  const { data: grantRows } =
    idsToFetch.length > 0
      ? await supabase
          .from("profile_cosmetic_grants")
          .select("user_id,bundle_key")
          .in("user_id", idsToFetch)
      : { data: [] };

  const grantsByUser = new Map<string, Set<string>>();
  for (const g of (grantRows ?? []) as Array<{ user_id: string; bundle_key: string }>) {
    if (!grantsByUser.has(g.user_id)) grantsByUser.set(g.user_id, new Set());
    grantsByUser.get(g.user_id)!.add(g.bundle_key);
  }

  const profilesTyped = (profiles ?? []) as unknown as Array<Record<string, unknown>>;
  const profileMap = new Map(profilesTyped.map((p) => [p.id as string, p]));
  const ratingMap = new Map(
    (stats ?? []).map((s) => [s.user_id as string, s.current_rating as number]),
  );

  // Helper: para un user, resolver su accent + card_style respetando
  // ownership (igual lógica que ProfileScreen.tsx y setProfileCustomization).
  function resolveCustomization(p: Record<string, unknown>): {
    accentHex: string | null;
    cardStyleCss: FriendLite["cardStyleCss"];
  } {
    const userId = p.id as string;
    const isPremium = deriveIsPremium({
      plan_tier: p.plan_tier,
      plan_expires_at: p.plan_expires_at,
    });
    const myGrants = grantsByUser.get(userId) ?? new Set<string>();
    const ownArgs = { isPremium, myGrants };
    const accentRaw = findAccent((p.accent_color as string | null) ?? null);
    const cardRaw = findCardStyle((p.card_style as string | null) ?? null);
    const accentObj =
      accentRaw && canUsePreset(accentRaw.bundleKey, ownArgs) ? accentRaw : null;
    const cardObj = cardRaw && canUsePreset(cardRaw.bundleKey, ownArgs) ? cardRaw : null;
    return {
      accentHex: accentObj?.hex ?? null,
      cardStyleCss: cardObj?.css ?? null,
    };
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
      const customization = resolveCustomization(p);
      return {
        id,
        name: (p.display_name as string) ?? "Jugador",
        username: (p.username as string | null | undefined) ?? null,
        city: (p.city as string | null) ?? "—",
        sport: sportLabel(p.preferred_sport as string | null),
        level: levelFromRating(ratingMap.get(id)),
        isOfficial: p.is_system === true,
        isPremium: deriveIsPremium(p),
        accentHex: customization.accentHex,
        cardStyleCss: customization.cardStyleCss,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f != null);

  const requestsList: RequestLite[] = (requests ?? [])
    .map((r) => {
      const p = profileMap.get(r.from_user_id as string) as Record<string, unknown> | undefined;
      if (!p) return null;
      const customization = resolveCustomization(p);
      return {
        id: r.id as string,
        fromUserId: r.from_user_id as string,
        name: (p.display_name as string) ?? "Jugador",
        username: (p.username as string | null | undefined) ?? null,
        city: (p.city as string | null) ?? "—",
        sport: sportLabel(p.preferred_sport as string | null),
        level: levelFromRating(ratingMap.get(r.from_user_id as string)),
        isOfficial: p.is_system === true,
        isPremium: deriveIsPremium(p),
        accentHex: customization.accentHex,
        cardStyleCss: customization.cardStyleCss,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  // Sugerencias: profiles en misma city que no estén ya en friends/requests.
  let suggestions: FriendLite[] = [];
  if (myCity) {
    const { data: candidatesRaw } = await supabase
      .from("profiles")
      .select(
        "id,display_name,username,city,preferred_sport,is_system,plan_tier,plan_expires_at,accent_color,card_style" as never,
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
    // Grants también para candidates.
    const { data: candGrants } =
      candidateIds.length > 0
        ? await supabase
            .from("profile_cosmetic_grants")
            .select("user_id,bundle_key")
            .in("user_id", candidateIds)
        : { data: [] };
    for (const g of (candGrants ?? []) as Array<{ user_id: string; bundle_key: string }>) {
      if (!grantsByUser.has(g.user_id)) grantsByUser.set(g.user_id, new Set());
      grantsByUser.get(g.user_id)!.add(g.bundle_key);
    }
    suggestions = candidates
      .filter((c) => !exclude.has(c.id as string))
      .slice(0, SUGGESTIONS_LIMIT)
      .map((c) => {
        const customization = resolveCustomization(c);
        return {
          id: c.id as string,
          name: (c.display_name as string) ?? "Jugador",
          username: (c.username as string | null | undefined) ?? null,
          city: (c.city as string | null) ?? "—",
          sport: sportLabel(c.preferred_sport as string | null),
          level: levelFromRating(candRatingMap.get(c.id as string)),
          isOfficial: false,
          isPremium: deriveIsPremium(c),
          accentHex: customization.accentHex,
          cardStyleCss: customization.cardStyleCss,
        };
      });
  }

  return { friends, requests: requestsList, suggestions, myCity, meUserId: userId };
}

export async function AmigosScreen() {
  const data = await loadData();
  return <AmigosScreenView {...data} />;
}
