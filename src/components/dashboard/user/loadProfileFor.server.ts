import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import type { ProfileData, ModeRating, ProfileFriendPreview } from "./profile-types";

const STARTING_RATING = 2500;
const SPORT_PRIMARY = "pickleball" as const;

function latestAnalyticsUpdatedAt(input: {
  statsRows: Array<{ updated_at?: string }> | null;
  matchHistory: { playedAt: string }[];
  ratingSnapshotsByMode: ProfileData["ratingSnapshotsByMode"];
}): string | null {
  const candidates: string[] = [];
  for (const row of input.statsRows ?? []) {
    if (typeof row.updated_at === "string") candidates.push(row.updated_at);
  }
  const latestMatch = input.matchHistory[0]?.playedAt;
  if (latestMatch) candidates.push(latestMatch);
  for (const mode of ["singles", "doubles"] as const) {
    const snaps = input.ratingSnapshotsByMode[mode];
    const last = snaps[snaps.length - 1]?.snapshotAt;
    if (last) candidates.push(last);
  }
  let bestMs: number | null = null;
  let bestIso: string | null = null;
  for (const iso of candidates) {
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) continue;
    if (bestMs === null || ms > bestMs) {
      bestMs = ms;
      bestIso = iso;
    }
  }
  return bestIso;
}

export async function loadProfileFor(
  targetUserId?: string,
  opts?: { matchHistoryCap?: number | null },
): Promise<ProfileData> {
  const session = await getSession();
  const supabase = await getServerClient();

  const userId = targetUserId ?? (session.authenticated ? session.session.userId : null);

  if (!userId) {
    return {
      meUserId: null,
      name: "Invitado",
      username: "guest",
      isPremium: false,
      city: null,
      bio: null,
      avatarUrl: null,
      primaryClub: null,
      clubs: [],
      memberSince: new Date().toISOString(),
      currentRating: STARTING_RATING,
      rank: null,
      matchesTotal: 0,
      wins: 0,
      losses: 0,
      ratings: { singles: null, doubles: null },
      ratingSnapshotsByMode: { singles: [], doubles: [] },
      coachShotInsights: [],
      matchHistory: [],
      badges: [],
      country: null,
      friendsPreview: null,
    };
  }

  const [
    { data: profile },
    { data: statsRows },
    { data: rankRows },
    { data: roleRows },
    { data: rawMatches },
    { data: ratingHistory },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name,username,city,country,bio,avatar_url,created_at,plan_tier,plan_expires_at",
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("player_stats")
      .select("mode,matches_total,wins,losses,current_rating,updated_at")
      .eq("user_id", userId)
      .eq("sport", SPORT_PRIMARY),
    supabase
      .from("mv_user_ranking")
      .select("rank,mode")
      .eq("user_id", userId)
      .eq("sport", SPORT_PRIMARY),
    supabase
      .from("role_assignments")
      .select("role,club_id,granted_at,clubs(name,city)")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .not("club_id", "is", null),
    supabase
      .from("matches")
      .select(
        "id,played_at,sport,mode,club_id,team_a_player_ids,team_b_player_ids,score,rating_deltas,clubs(name)",
      )
      .eq("status", "confirmed")
      .or(`team_a_player_ids.cs.{${userId}},team_b_player_ids.cs.{${userId}}`)
      .order("played_at", { ascending: false })
      .limit(opts?.matchHistoryCap ?? 200),
    supabase
      .from("ranking_snapshots")
      .select("rating,snapshot_at,mode")
      .eq("user_id", userId)
      .eq("sport", SPORT_PRIMARY)
      .order("snapshot_at", { ascending: true })
      .limit(120),
  ]);

  const histRows = (ratingHistory ?? []) as unknown as Array<Record<string, unknown>>;
  const histByMode = (m: "singles" | "doubles") =>
    histRows
      .filter((h) => h.mode === m)
      .map((h) => ({ rating: h.rating as number, snapshotAt: h.snapshot_at as string }));
  const ratingSnapshotsByMode = { singles: histByMode("singles"), doubles: histByMode("doubles") };

  type RawMatch = {
    id: string;
    played_at: string;
    sport: string;
    mode: string;
    club_id: string | null;
    team_a_player_ids: string[] | null;
    team_b_player_ids: string[] | null;
    score: { winner?: string; sets?: [number, number][] } | null;
    rating_deltas?: Record<string, number> | null;
    clubs?: { name?: string } | null;
  };
  const matchesTyped = (rawMatches ?? []) as unknown as RawMatch[];

  const rankByMode = new Map<string, number>();
  for (const r of (rankRows ?? []) as Array<{ rank?: number; mode?: string }>) {
    if (r.mode && typeof r.rank === "number") rankByMode.set(r.mode, r.rank);
  }

  const buildMode = (mode: "singles" | "doubles"): ModeRating | null => {
    const row = (statsRows ?? []).find((s) => s.mode === mode);
    if (!row) return null;
    return {
      currentRating: (row.current_rating as number | undefined) ?? STARTING_RATING,
      matchesTotal: (row.matches_total as number | undefined) ?? 0,
      wins: (row.wins as number | undefined) ?? 0,
      losses: (row.losses as number | undefined) ?? 0,
      rank: rankByMode.get(mode) ?? null,
    };
  };

  const singles = buildMode("singles");
  const doubles = buildMode("doubles");

  const oppIds = new Set<string>();
  for (const m of matchesTyped) {
    const ta = m.team_a_player_ids ?? [];
    const tb = m.team_b_player_ids ?? [];
    const opps = ta.includes(userId) ? tb : ta;
    for (const o of opps) oppIds.add(o);
  }
  const oppProfilesArr =
    oppIds.size > 0
      ? (
          await supabase
            .from("profiles")
            .select("id,display_name,avatar_url")
            .in("id", Array.from(oppIds))
        ).data ?? []
      : [];
  const oppById = new Map<string, { name: string; avatarUrl: string | null }>();
  for (const p of oppProfilesArr) {
    oppById.set(p.id as string, {
      name: (p.display_name as string | null) ?? "Sin nombre",
      avatarUrl: (p.avatar_url as string | null) ?? null,
    });
  }

  const matchHistory = matchesTyped.map((m) => {
    const ta = m.team_a_player_ids ?? [];
    const tb = m.team_b_player_ids ?? [];
    const onTeamA = ta.includes(userId);
    const opps = onTeamA ? tb : ta;
    const score = m.score ?? {};
    const winnerSide = score.winner === "a" ? "a" : "b";
    const won = (onTeamA && winnerSide === "a") || (!onTeamA && winnerSide === "b");
    const firstOpp = opps[0] ? oppById.get(opps[0]) : null;
    const oppName =
      opps.length > 1 && firstOpp
        ? `${firstOpp.name} +${opps.length - 1}`
        : firstOpp?.name ?? "Rival";
    const rawSets = Array.isArray(score.sets) ? score.sets : [];
    const sets: [number, number][] = rawSets.map((s) =>
      onTeamA ? ([s[0], s[1]] as [number, number]) : ([s[1], s[0]] as [number, number]),
    );
    const clubName = m.clubs?.name ?? null;
    const deltas = m.rating_deltas ?? {};
    const myDelta = typeof deltas[userId] === "number" ? deltas[userId] : null;
    return {
      id: m.id,
      playedAt: m.played_at,
      sport: m.sport,
      mode: m.mode,
      clubName,
      result: (won ? "win" : "loss") as "win" | "loss",
      sets,
      oppName,
      oppAvatarUrl: firstOpp?.avatarUrl ?? null,
      ratingDelta: myDelta,
    };
  });

  const clubs = (roleRows ?? []).map((r) => {
    const c = r.clubs as { name?: string; city?: string } | null;
    return {
      id: r.club_id as string,
      name: c?.name ?? "Club",
      city: c?.city ?? "—",
      role: r.role as string,
      since: r.granted_at as string,
    };
  });

  const ROLE_PRIORITY = ["owner", "manager", "coach", "employee", "partner", "user"];
  const sortedClubs = [...clubs].sort((a, b) => {
    const ai = ROLE_PRIORITY.indexOf(a.role);
    const bi = ROLE_PRIORITY.indexOf(b.role);
    return ai - bi;
  });
  const primaryClub = sortedClubs[0] ?? null;
  const legacy = singles ?? doubles;
  const isOwn = session.authenticated && session.session.userId === userId;

  const AVATAR_GRADIENTS = [
    "linear-gradient(135deg,#7c3aed,#db2777)",
    "linear-gradient(135deg,#f59e0b,#ef4444)",
    "linear-gradient(135deg,#06b6d4,#1e40af)",
    "linear-gradient(135deg,#10b981,#047857)",
    "linear-gradient(135deg,#dc2626,#7f1d1d)",
  ];

  let friendsPreview: ProfileFriendPreview | null = null;

  if (isOwn) {
    const { data: friendships } = await supabase
      .from("friendships")
      .select("user_a,user_b")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .limit(200);

    const friendIds = (friendships ?? []).map((f) =>
      (f.user_a as string) === userId ? (f.user_b as string) : (f.user_a as string),
    );

    if (friendIds.length > 0) {
      const previewIds = friendIds.slice(0, 7);
      const { data: friendProfiles } = await supabase
        .from("profiles")
        .select("id,display_name,avatar_url")
        .in("id", previewIds);

      const members = (friendProfiles ?? []).map((p, i) => {
        const name = (p.display_name as string | null) ?? "?";
        const parts = name.trim().split(/\s+/);
        const initials =
          ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
        return {
          initials,
          tone: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
          avatarUrl: (p.avatar_url as string | null) ?? null,
        };
      });

      friendsPreview = { count: friendIds.length, members };
    } else {
      friendsPreview = { count: 0, members: [] };
    }
  }

  let editable: ProfileData["editable"] = null;
  if (isOwn) {
    const { data: ed } = await supabase
      .from("profiles")
      .select(
        "first_name,last_name,bio,city,country,birthdate,phone,dominant_hand,preferred_sport,skill_level,locale",
      )
      .eq("id", userId)
      .maybeSingle();
    if (ed) {
      const e = ed as Record<string, unknown>;
      editable = {
        firstName: (e.first_name as string | null) ?? null,
        lastName: (e.last_name as string | null) ?? null,
        bio: (e.bio as string | null) ?? null,
        city: (e.city as string | null) ?? null,
        country: (e.country as string | null) ?? null,
        birthdate: (e.birthdate as string | null) ?? null,
        phone: (e.phone as string | null) ?? null,
        dominantHand: (e.dominant_hand as "left" | "right" | null) ?? null,
        preferredSport: (e.preferred_sport as "tennis" | "padel" | "pickleball" | null) ?? null,
        skillLevel:
          (e.skill_level as "beginner" | "intermediate" | "advanced" | "pro" | null) ?? null,
        locale: (e.locale as "es" | "en" | "pt" | null) ?? null,
      };
    }
  }

  return {
    meUserId: userId,
    name: (profile?.display_name as string | undefined) ?? "Jugador",
    username: (profile?.username as string | undefined) ?? "jugador",
    isPremium:
      ((profile?.plan_tier as string | null | undefined) ?? "free") === "premium" &&
      ((profile?.plan_expires_at as string | null | undefined) == null ||
        new Date(profile?.plan_expires_at as string).getTime() > Date.now()),
    city: (profile?.city as string | undefined) ?? null,
    country: (profile?.country as string | null | undefined) ?? null,
    bio: (profile?.bio as string | undefined) ?? null,
    avatarUrl: (profile?.avatar_url as string | null | undefined) ?? null,
    primaryClub: primaryClub
      ? { id: primaryClub.id, name: primaryClub.name, city: primaryClub.city }
      : null,
    clubs: sortedClubs,
    memberSince: (profile?.created_at as string | undefined) ?? new Date().toISOString(),
    currentRating: legacy?.currentRating ?? STARTING_RATING,
    rank: legacy?.rank ?? null,
    matchesTotal: legacy?.matchesTotal ?? 0,
    wins: legacy?.wins ?? 0,
    losses: legacy?.losses ?? 0,
    ratings: { singles, doubles },
    ratingSnapshotsByMode,
    coachShotInsights: [],
    matchHistory,
    analyticsUpdatedAt: latestAnalyticsUpdatedAt({
      statsRows: statsRows as Array<{ updated_at?: string }> | null,
      matchHistory,
      ratingSnapshotsByMode,
    }),
    matchHistoryCap: opts?.matchHistoryCap ?? null,
    badges: await loadBadgesFor(supabase, userId),
    editable,
    friendsPreview,
  };
}

async function loadBadgesFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<ProfileData["badges"]> {
  const [{ data: catalogRaw }, { data: unlocksRaw }] = await Promise.all([
    supabase
      .from("badges")
      .select("kind,label,icon,description,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("player_badges")
      .select("badge_kind")
      .eq("user_id", userId),
  ]);
  const catalog = (catalogRaw ?? []) as Array<{
    kind: string;
    label: string;
    icon: string;
    description: string | null;
  }>;
  const unlocked = new Set(
    ((unlocksRaw ?? []) as Array<{ badge_kind: string }>).map((r) => r.badge_kind),
  );
  return catalog.map((b) => ({
    kind: b.kind,
    label: b.label,
    icon: b.icon,
    description: b.description,
    on: unlocked.has(b.kind),
  }));
}
