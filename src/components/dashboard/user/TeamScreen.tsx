// Server: fetch mi team (primer team donde soy miembro) + roster + caps por plan.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { getTeamCaps } from "@/lib/teams/caps";
import { computeTeamMpr } from "@/lib/teams/mpr";
import { findAccent, findCardStyle } from "@/lib/profile/customization-presets";
import { canUsePreset } from "@/lib/profile/bundles";
import { listMyFriends } from "@/server/actions/friends";
import { getTeamAchievementsServer } from "@/server/actions/team-achievements";
import {
  TeamScreenView,
  type AchievementLite,
  type FriendLite,
  type PendingInviteLite,
  type TeamLite,
  type TeamMemberLite,
} from "./TeamScreenView";

const FALLBACK_RATING = 2500;
// Default si el team no tiene sport definido o es 'multi'. El team MPR se
// computa sobre este sport en mode 'doubles' (típico para teams).
const DEFAULT_SPORT = "pickleball" as const;
const TEAM_MODE = "doubles" as const;

const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
};

function resolveTeamSport(raw: string | null | undefined): "pickleball" | "padel" | "tennis" {
  if (raw === "pickleball" || raw === "padel" || raw === "tennis") return raw;
  return DEFAULT_SPORT;
}

function levelFromRating(elo: number | null | undefined): number {
  return Math.round(((elo ?? FALLBACK_RATING) / 1000) * 10) / 10;
}

function roleLabel(role: string, isCaptain: boolean): string {
  if (role === "captain" || isCaptain) return "Capitán";
  if (role === "substitute") return "Suplente";
  return "Titular";
}

async function loadTeam(): Promise<TeamLite | null> {
  const session = await getSession();
  if (!session.authenticated) return null;
  const userId = session.session.userId;
  const supabase = await getServerClient();

  // Membership lookup.
  const { data: myMemberships } = await supabase
    .from("team_members")
    .select("team_id,role,joined_at")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false })
    .limit(1);

  if (!myMemberships || myMemberships.length === 0) return null;

  const teamId = myMemberships[0].team_id as string;

  const [{ data: teamRaw }, { data: allMembers }, { data: pendingRaw }, achievements] = await Promise.all([
    supabase
      .from("teams")
      .select("id,name,slug,tag,color,sport,description,invite_code,captain_id,created_at,captain_only_invites,require_join_approval,show_in_ranking,allow_external_chat_guests,status,is_verified,is_pinned,profiles!teams_captain_id_fkey(display_name)")
      .eq("id", teamId)
      .maybeSingle(),
    supabase
      .from("team_members")
      .select(
        "user_id,role,profiles(display_name,username,accent_color,card_style,plan_tier,plan_expires_at)",
      )
      .eq("team_id", teamId),
    supabase
      .from("team_invites")
      .select("id,created_at,invited_user_id,profiles!team_invites_invited_user_id_fkey(display_name)")
      .eq("team_id", teamId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    getTeamAchievementsServer(teamId, 5),
  ]);

  if (!teamRaw) return null;
  // rename_count se lee en una query lateral mínima para no romper la
  // inference del select principal. Los Database types se regeneran aparte.
  const { data: renameCountRaw } = await supabase
    .from("teams")
    .select("rename_count")
    .eq("id", teamId)
    .maybeSingle();
  const team = teamRaw;
  const renameCount =
    ((renameCountRaw as { rename_count?: number | null } | null)?.rename_count) ?? 0;

  // Sport+mode efectivos del team. player_stats pkey = (user_id, sport, mode)
  // desde mig 064, así que filtramos por ambos para no traer filas duplicadas.
  const teamSport = resolveTeamSport(team.sport as string | null | undefined);
  const memberIds = (allMembers ?? []).map((m) => m.user_id as string);
  const { data: stats } =
    memberIds.length > 0
      ? await supabase
          .from("player_stats")
          .select("user_id,current_rating,matches_total,wins")
          .in("user_id", memberIds)
          .eq("sport", teamSport)
          .eq("mode", TEAM_MODE)
      : { data: [] };

  const statsMap = new Map((stats ?? []).map((s) => [s.user_id as string, s]));

  // Grants cosméticos de los miembros (mig 115 abrió SELECT público).
  const { data: grantRows } =
    memberIds.length > 0
      ? await supabase
          .from("profile_cosmetic_grants")
          .select("user_id,bundle_key")
          .in("user_id", memberIds)
      : { data: [] };
  const grantsByUser = new Map<string, Set<string>>();
  for (const g of (grantRows ?? []) as Array<{ user_id: string; bundle_key: string }>) {
    if (!grantsByUser.has(g.user_id)) grantsByUser.set(g.user_id, new Set());
    grantsByUser.get(g.user_id)!.add(g.bundle_key);
  }
  function memberIsPremium(p: { plan_tier?: unknown; plan_expires_at?: unknown }): boolean {
    if (p.plan_tier !== "premium") return false;
    const exp = p.plan_expires_at;
    if (exp == null) return true;
    return new Date(exp as string).getTime() > Date.now();
  }
  function resolveMemberCustomization(
    userId: string,
    profile: Record<string, unknown> | null,
  ): { accentHex: string | null; cardStyleCss: TeamMemberLite["cardStyleCss"] } {
    if (!profile) return { accentHex: null, cardStyleCss: null };
    const ownArgs = {
      isPremium: memberIsPremium({
        plan_tier: profile.plan_tier,
        plan_expires_at: profile.plan_expires_at,
      }),
      myGrants: grantsByUser.get(userId) ?? new Set<string>(),
    };
    const accentRaw = findAccent((profile.accent_color as string | null) ?? null);
    const cardRaw = findCardStyle((profile.card_style as string | null) ?? null);
    const accentObj =
      accentRaw && canUsePreset(accentRaw.bundleKey, ownArgs) ? accentRaw : null;
    const cardObj = cardRaw && canUsePreset(cardRaw.bundleKey, ownArgs) ? cardRaw : null;
    return {
      accentHex: accentObj?.hex ?? null,
      cardStyleCss: cardObj?.css ?? null,
    };
  }

  const captainId = team.captain_id as string;
  const members: TeamMemberLite[] = (allMembers ?? []).map((m) => {
    const profile = m.profiles as Record<string, unknown> | null;
    const s = statsMap.get(m.user_id as string);
    const total = (s?.matches_total as number | undefined) ?? 0;
    const wins = (s?.wins as number | undefined) ?? 0;
    const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
    const customization = resolveMemberCustomization(m.user_id as string, profile);
    return {
      userId: m.user_id as string,
      username: (profile?.username as string | undefined) ?? null,
      name: (profile?.display_name as string | undefined) ?? "Jugador",
      role: roleLabel(m.role as string, (m.user_id as string) === captainId),
      level: levelFromRating(s?.current_rating as number | null | undefined),
      played: total,
      wr,
      online: false,
      accentHex: customization.accentHex,
      cardStyleCss: customization.cardStyleCss,
    };
  });

  members.sort((a, b) => {
    if (a.userId === captainId) return -1;
    if (b.userId === captainId) return 1;
    return b.played - a.played;
  });

  const totalWins = members.reduce((acc, m) => acc + Math.round((m.played * m.wr) / 100), 0);
  const totalPlayed = members.reduce((acc, m) => acc + m.played, 0);
  const totalLosses = Math.max(0, totalPlayed - totalWins);

  // Team MPR computado: weighted avg del current_rating de cada miembro,
  // ponderado por matches_total + 1. Lee de la misma statsMap del roster.
  const mprRows = (allMembers ?? [])
    .map((m) => {
      const s = statsMap.get(m.user_id as string);
      if (!s) return null;
      return {
        userId: m.user_id as string,
        currentRating: (s.current_rating as number | undefined) ?? FALLBACK_RATING,
        matchesTotal: (s.matches_total as number | undefined) ?? 0,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const teamMprResult = computeTeamMpr(mprRows);

  const captainProfile = team.profiles as { display_name?: string } | null;
  const created = new Date(team.created_at as string);

  const pendingInvites: PendingInviteLite[] = (pendingRaw ?? []).map((p) => {
    const prof = p.profiles as { display_name?: string } | null;
    return {
      id: p.id as string,
      displayName: prof?.display_name ?? "Invitado",
      sentAt: p.created_at as string,
    };
  });

  // Caps efectivos según el plan del captain. El viewer (que puede ser
  // otro user del team) lee los caps del CAPTAIN, no los suyos, porque
  // el cap del roster depende del plan del que lidera.
  const captainSummary = await getProfileSummary(captainId);
  const caps = await getTeamCaps(captainSummary);

  const achievementsLite: AchievementLite[] = achievements.map((a) => ({
    id: a.id,
    kind: a.kind,
    title: a.title,
    subtitle: a.subtitle,
    awardedAt: a.awardedAt,
  }));

  return {
    id: team.id as string,
    name: team.name as string,
    tag: ((team.tag as string | null) ?? (team.slug as string) ?? "TEAM").slice(0, 4).toUpperCase(),
    sport: SPORT_LABEL[(team.sport as string) ?? "pickleball"] ?? "Multi",
    teamMpr: teamMprResult.rating,
    description: (team.description as string | null | undefined) ?? null,
    inviteCode: (team.invite_code as string | null | undefined) ?? null,
    accentHex: (team.color as string | null) ?? null,
    captainId,
    captainName: captainProfile?.display_name ?? "Capitán",
    founded: String(created.getFullYear()),
    wins: totalWins,
    losses: totalLosses,
    rank: null,
    league: "Sin liga asignada",
    members,
    pendingInvites,
    achievements: achievementsLite,
    status: ((team as Record<string, unknown>).status as TeamLite["status"]) ?? "active",
    isVerified: (team as Record<string, unknown>).is_verified === true,
    isPinned: (team as Record<string, unknown>).is_pinned === true,
    settings: {
      captainOnlyInvites: (team as Record<string, unknown>).captain_only_invites !== false,
      requireJoinApproval: (team as Record<string, unknown>).require_join_approval !== false,
      showInRanking: (team as Record<string, unknown>).show_in_ranking !== false,
      allowExternalChatGuests: (team as Record<string, unknown>).allow_external_chat_guests === true,
    },
    renameCount,
    captainPlanTier: captainSummary.planTier,
    caps,
  };
}

export type PublicTeamLite = {
  id: string;
  name: string;
  tag: string;
  sport: string | null;
  city: string | null;
  members: number;
  privacy: "public" | "invite" | "private";
  isPinned: boolean;
  isVerified: boolean;
};

async function loadPublicTeams(): Promise<PublicTeamLite[]> {
  const session = await getSession();
  if (!session.authenticated) return [];
  const supabase = await getServerClient();
  // Teams con privacy 'public' o 'invite' donde NO soy miembro ya.
  const userId = session.session.userId;
  const { data: myTeamIds } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  const excluded = new Set((myTeamIds ?? []).map((m) => m.team_id as string));

  const { data: rows } = await supabase
    .from("teams")
    .select("id,name,slug,tag,sport,privacy,status,is_pinned,is_verified,clubs(city)")
    .in("privacy", ["public", "invite"])
    .eq("status", "active")
    // Pinned primero (mig 165 admin pin), después por creación desc.
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  const candidates = (rows ?? []).filter((t) => !excluded.has(t.id as string)).slice(0, 8);
  if (candidates.length === 0) return [];

  const ids = candidates.map((t) => t.id as string);
  const { data: counts } = await supabase
    .from("team_members")
    .select("team_id")
    .in("team_id", ids);
  const countMap = new Map<string, number>();
  for (const c of counts ?? []) {
    const k = c.team_id as string;
    countMap.set(k, (countMap.get(k) ?? 0) + 1);
  }

  return candidates.map((t) => {
    const club = t.clubs as { city?: string } | null;
    return {
      id: t.id as string,
      name: t.name as string,
      tag: ((t.tag as string | null) ?? (t.slug as string) ?? "TEAM").slice(0, 4).toUpperCase(),
      sport: (t.sport as string | null) ?? null,
      city: club?.city ?? null,
      members: countMap.get(t.id as string) ?? 0,
      privacy: (t.privacy as PublicTeamLite["privacy"]) ?? "public",
      isPinned: (t as Record<string, unknown>).is_pinned === true,
      isVerified: (t as Record<string, unknown>).is_verified === true,
    };
  });
}


async function loadFriends(): Promise<FriendLite[]> {
  const res = await listMyFriends();
  if (!res.ok) return [];
  return res.data.map((f) => ({
    userId: f.userId,
    displayName: f.displayName,
    avatarUrl: f.avatarUrl,
    city: f.city,
  }));
}

export async function TeamScreen() {
  const [team, publicTeams, friends, session] = await Promise.all([
    loadTeam(),
    loadPublicTeams(),
    loadFriends(),
    getSession(),
  ]);
  const meUserId = session.authenticated ? session.session.userId : null;
  return <TeamScreenView team={team} publicTeams={publicTeams} friends={friends} meUserId={meUserId} />;
}
