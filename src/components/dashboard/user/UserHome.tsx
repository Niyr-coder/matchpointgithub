// Server: fetch profile + stats + reservations + torneos + history.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary, isPlanActive } from "@/lib/auth/profile";
import { listFeaturedTournaments } from "@/server/actions/tournaments";
import type { TournamentFeatured } from "@/lib/schemas/tournaments";
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
      ratingsByMode: { singles: null, doubles: null },
      reservations: [],
      tournaments: tournaments.ok ? tournaments.data : [],
      ratingHistory: [],
      historiesByMode: { singles: [], doubles: [] },
      planTier: "free",
      planExpiresAt: null,
      badges: [],
    };
  }

  const userId = session.session.userId;

  const [
    profile,
    { data: statsRows },
    { data: rankRows },
    { data: reservations },
    { data: myTournaments },
    { data: history },
  ] = await Promise.all([
    // getProfileSummary está cacheado por request: si [role]/layout.tsx ya lo
    // pidió en el mismo render, esto no dispara query extra.
    getProfileSummary(userId),
    supabase
      .from("player_stats")
      .select("mode,matches_total,current_rating")
      .eq("user_id", userId)
      .eq("sport", SPORT_PRIMARY),
    supabase
      .from("mv_user_ranking")
      .select("rank,sport,mode")
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
    // Torneos en los que el user está inscrito (pending/accepted) y aún no
    // han pasado. Reemplaza los "featured" globales con algo más relevante.
    supabase
      .from("registrations")
      .select(
        "tournament_id,tournaments(id,slug,name,starts_at,ends_at,prize_pool_cents,entry_fee_cents,currency,max_participants,sport,format,status,club_id,clubs(name,city))",
      )
      .contains("player_ids", [userId])
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("ranking_snapshots")
      .select("rating,snapshot_at")
      .eq("user_id", userId)
      .eq("sport", SPORT_PRIMARY)
      .order("snapshot_at", { ascending: true })
      .limit(8),
  ]);

  // Adaptar inscripciones del user a TournamentFeatured. Filtramos a los
  // que aún no han pasado y los ordenamos por starts_at ascendente.
  const nowMs = Date.now();
  const tournamentsAdapted: TournamentFeatured[] = ((myTournaments ?? []) as Array<Record<string, unknown>>)
    .map((r) => r.tournaments as Record<string, unknown> | null)
    .filter((t): t is Record<string, unknown> => t != null)
    .filter((t) => {
      // Mantenemos torneos cancelados aunque sean futuros, para que el user
      // vea el cambio de estado en el widget. Solo descartamos torneos que
      // ya terminaron y NO están cancelados (los cancelados se ven hasta
      // que el user cancele su inscripción).
      const ends = t.ends_at as string | null;
      const status = t.status as string;
      if (status === "cancelled") return true;
      return ends ? new Date(ends).getTime() >= nowMs : true;
    })
    .map((t) => {
      const club = t.clubs as { name?: string; city?: string } | null;
      return {
        id: t.id as string,
        slug: t.slug as string,
        name: t.name as string,
        startsAt: t.starts_at as string,
        endsAt: t.ends_at as string,
        prizePoolCents: (t.prize_pool_cents as number | null) ?? null,
        entryFeeCents: (t.entry_fee_cents as number | undefined) ?? 0,
        currency: (t.currency as TournamentFeatured["currency"]) ?? null,
        maxParticipants: (t.max_participants as number | null) ?? null,
        sport: t.sport as TournamentFeatured["sport"],
        format: t.format as TournamentFeatured["format"],
        status: (t.status as string) ?? "draft",
        clubName: club?.name ?? null,
        clubCity: club?.city ?? null,
        registrationsCount: 0,
        isFeatured: false,
      };
    })
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
    .slice(0, 3);

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

  // Stats por modo.
  const statsSingles = (statsRows ?? []).find((s) => s.mode === "singles");
  const statsDoubles = (statsRows ?? []).find((s) => s.mode === "doubles");
  const ratingsByMode = {
    singles: (statsSingles?.current_rating as number | undefined) ?? null,
    doubles: (statsDoubles?.current_rating as number | undefined) ?? null,
  };

  // Legacy aggregate fields: prefer singles, fallback doubles.
  const legacyStats = statsSingles ?? statsDoubles;
  // Cast: tipos generados de mv_user_ranking aún no incluyen `mode`.
  const rankList = (rankRows ?? []) as Array<{ rank?: number; mode?: string }>;
  const legacyRank = rankList.find((r) => r.mode === "singles")
    ?? rankList.find((r) => r.mode === "doubles");

  // TODO: ranking_snapshots aún no es mode-aware. Pasamos el mismo array para
  // ambos modos por ahora; cuando snapshots tenga columna mode, separar aquí.
  const historiesByMode = { singles: ratingHistory, doubles: ratingHistory };

  const { tier: effectiveTier } = isPlanActive(profile);

  // Badges: catálogo (top 5 por sort_order) + unlocks del user.
  // Los casteamos a unknown[] porque los Database types están stale
  // (badges/player_badges agregadas en mig 108).
  const [{ data: badgeCatalogRaw }, { data: myUnlocksRaw }] = await Promise.all([
    supabase
      .from("badges")
      .select("kind,label,icon,sort_order")
      .eq("active" as never, true as never)
      .order("sort_order" as never, { ascending: true })
      .limit(5),
    supabase
      .from("player_badges")
      .select("badge_kind")
      .eq("user_id" as never, userId as never),
  ]);
  const catalog = (badgeCatalogRaw ?? []) as unknown as Array<{
    kind: string; label: string; icon: string; sort_order: number;
  }>;
  const unlockedKinds = new Set(
    ((myUnlocksRaw ?? []) as unknown as Array<{ badge_kind: string }>).map((r) => r.badge_kind),
  );
  const badges = catalog.map((b) => ({
    kind: b.kind,
    label: b.label,
    icon: b.icon,
    on: unlockedKinds.has(b.kind),
  }));

  return {
    meUserId: userId,
    name: profile.displayName ?? "Jugador",
    onboardedAt: profile.onboardedAt,
    currentRating: (legacyStats?.current_rating as number | undefined) ?? STARTING_RATING,
    rank: legacyRank?.rank ?? null,
    matchesTotal: (legacyStats?.matches_total as number | undefined) ?? 0,
    ratingsByMode,
    reservations: reservationsAdapted,
    tournaments: tournamentsAdapted,
    ratingHistory,
    historiesByMode,
    planTier: effectiveTier,
    planExpiresAt: profile.planExpiresAt,
    badges,
  };
}

export async function UserHome() {
  const data = await loadData();
  return <UserHomeView data={data} />;
}
