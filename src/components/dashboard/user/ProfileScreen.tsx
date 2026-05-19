// Server: fetch profile + stats + ranking + clubes. Match history + badges +
// preferences quedan mock hasta tener schema dedicado.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getPlanForUser } from "@/lib/auth/plan";
import { findAccent, findBanner, findCardStyle } from "@/lib/profile/customization-presets";
import { canUsePreset, bodyPatternForBundle } from "@/lib/profile/bundles";
import { ProfileScreenView, type ProfileData, type ModeRating } from "./ProfileScreenView";

const STARTING_RATING = 2500;
const SPORT_PRIMARY = "pickleball" as const;

// Carga el perfil del userId dado. Si no se pasa, carga el de la sesión
// actual (caso "Mi perfil"). Cuando se llama desde /dashboard/user/players/[id]
// recibimos un userId target y devolvemos su data pública.
//
// Importante: `meUserId` en el return es el userId del PERFIL cargado, no
// del viewer. Lo usa ProfileScreenView para filtros de realtime y otros
// derivados. El gating "isMine" se controla con prop `viewerMode` aparte.
//
// `opts.matchHistoryCap`: tope de partidos a devolver. null = ilimitado
// (max 200 defensivo). Mi Perfil → null. Vista pública free viewer → 10.
// Vista pública premium viewer → null. Ver /dashboard/user/players/[username]/page.tsx
// para la lógica del cap.
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
      matchHistory: [],
      badges: [],
    };
  }

  const [
    { data: profile },
    { data: statsRows },
    { data: rankRows },
    { data: roleRows },
    { data: rawMatches },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name,username,city,bio,avatar_url,created_at,accent_color,banner_preset,card_style" as never,
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("player_stats")
      .select("mode,matches_total,wins,losses,current_rating")
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
      .or(
        `team_a_player_ids.cs.{${userId}},team_b_player_ids.cs.{${userId}}`,
      )
      .order("played_at", { ascending: false })
      // Cap del viewer (free=10, premium/self=null). Max defensivo 200.
      .limit(opts?.matchHistoryCap ?? 200),
  ]);

  // Cast: matches.rating_deltas (migration 065) aún no está en los types
  // generados. Lo proyectamos como Record<userId, delta>.
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

  // Indexar stats y rank por modo. Cast: tipos generados de mv_user_ranking
  // aún no incluyen `mode` (regenerar después de la migración).
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

  // Resolver perfiles de oponentes en una sola query.
  const oppIds = new Set<string>();
  for (const m of matchesTyped) {
    const ta = m.team_a_player_ids ?? [];
    const tb = m.team_b_player_ids ?? [];
    const opps = ta.includes(userId) ? tb : ta;
    for (const o of opps) oppIds.add(o);
  }
  const oppProfilesArr = oppIds.size > 0
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

  // El primer "owner/manager/coach" gana sobre "user" para el chip principal.
  const ROLE_PRIORITY = ["owner", "manager", "coach", "employee", "partner", "user"];
  const sortedClubs = [...clubs].sort((a, b) => {
    const ai = ROLE_PRIORITY.indexOf(a.role);
    const bi = ROLE_PRIORITY.indexOf(b.role);
    return ai - bi;
  });
  const primaryClub = sortedClubs[0] ?? null;

  // Legacy root fields: prefer singles, fallback doubles, fallback starting.
  const legacy = singles ?? doubles;

  // Customización: cada preset tiene su propio gate (MP+ activo O ownership
  // del bundle). Bundles son compra única — persisten incluso si el user
  // pierde MP+. Por eso NO basta con `plan_tier === 'premium'`; chequeamos
  // ownership preset-por-preset con `canUsePreset`, igual que el server
  // action `setProfileCustomization`. Sincronía garantizada porque ambos
  // consumen el mismo helper `canUsePreset` del bundles.ts.
  const profileExt = (profile ?? {}) as {
    accent_color?: string | null;
    banner_preset?: string | null;
    card_style?: string | null;
  };
  const [targetPlan, grantsRes] = await Promise.all([
    getPlanForUser(supabase, userId),
    supabase
      .from("profile_cosmetic_grants")
      .select("bundle_key" as never)
      .eq("user_id", userId),
  ]);
  const isPremium = targetPlan.tier === "premium";
  const myGrants = new Set(
    ((grantsRes.data ?? []) as Array<{ bundle_key: string }>).map((g) => g.bundle_key),
  );
  const ownArgs = { isPremium, myGrants };
  const accentRaw = findAccent(profileExt.accent_color ?? null);
  const bannerRaw = findBanner(profileExt.banner_preset ?? null);
  const cardStyleRaw = findCardStyle(profileExt.card_style ?? null);
  const accentObj = accentRaw && canUsePreset(accentRaw.bundleKey, ownArgs) ? accentRaw : null;
  const bannerObj = bannerRaw && canUsePreset(bannerRaw.bundleKey, ownArgs) ? bannerRaw : null;
  const cardStyleObj = cardStyleRaw && canUsePreset(cardStyleRaw.bundleKey, ownArgs) ? cardStyleRaw : null;
  // Body pattern viene del bundle del banner activo. Si el banner es de
  // 'mp_plus' (no bundle pago), no hay pattern temático.
  const bodyPattern = bannerObj ? bodyPatternForBundle(bannerObj.bundleKey) : null;

  return {
    meUserId: userId,
    name: (profile?.display_name as string | undefined) ?? "Jugador",
    username: (profile?.username as string | undefined) ?? "jugador",
    city: (profile?.city as string | undefined) ?? null,
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
    matchHistory,
    matchHistoryCap: opts?.matchHistoryCap ?? null,
    badges: await loadBadgesFor(supabase, userId),
    accentHex: accentObj?.hex ?? null,
    bannerCss: bannerObj?.background ?? null,
    bodyPattern,
    bundleKey: bannerObj?.bundleKey ?? null,
    cardStyleCss: cardStyleObj?.css ?? null,
  };
}

// Insignias del target: catálogo completo + flag on según si las desbloqueó.
// Las que NO ha desbloqueado se muestran en gris con la descripción del
// criterio (para que el viewer sepa qué falta).
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

export async function ProfileScreen() {
  const data = await loadProfileFor();
  return <ProfileScreenView data={data} />;
}
