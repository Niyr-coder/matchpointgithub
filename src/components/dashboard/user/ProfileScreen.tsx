// Server: fetch profile + stats + ranking + clubes. Match history + badges +
// preferences quedan mock hasta tener schema dedicado.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { ProfileScreenView, type ProfileData } from "./ProfileScreenView";

const STARTING_RATING = 2500;
const SPORT_PRIMARY = "pickleball" as const;

async function loadProfile(): Promise<ProfileData> {
  const session = await getSession();
  const supabase = await getServerClient();

  if (!session.authenticated) {
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
    };
  }

  const userId = session.session.userId;

  const [
    { data: profile },
    { data: stats },
    { data: rankRows },
    { data: roleRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name,username,city,bio,avatar_url,created_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("player_stats")
      .select("matches_total,wins,losses,current_rating")
      .eq("user_id", userId)
      .eq("sport", SPORT_PRIMARY)
      .maybeSingle(),
    supabase
      .from("mv_user_ranking")
      .select("rank")
      .eq("user_id", userId)
      .eq("sport", SPORT_PRIMARY),
    supabase
      .from("role_assignments")
      .select("role,club_id,granted_at,clubs(name,city)")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .not("club_id", "is", null),
  ]);

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
    currentRating: (stats?.current_rating as number | undefined) ?? STARTING_RATING,
    rank: (rankRows?.[0]?.rank as number | undefined) ?? null,
    matchesTotal: (stats?.matches_total as number | undefined) ?? 0,
    wins: (stats?.wins as number | undefined) ?? 0,
    losses: (stats?.losses as number | undefined) ?? 0,
  };
}

export async function ProfileScreen() {
  const data = await loadProfile();
  return <ProfileScreenView data={data} />;
}
