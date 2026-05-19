// Server: fetch mi team (primer team donde soy miembro) + roster + caps por plan.
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { getTeamCaps } from "@/lib/teams/caps";
import { listMyFriends } from "@/server/actions/friends";
import {
  TeamScreenView,
  type FriendLite,
  type PendingInviteLite,
  type TeamLite,
  type TeamMemberLite,
} from "./TeamScreenView";

const FALLBACK_RATING = 2500;
const SPORT_PRIMARY = "pickleball" as const;

const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
};

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

  const [{ data: teamRaw }, { data: allMembers }, { data: pendingRaw }] = await Promise.all([
    supabase
      .from("teams")
      .select("id,name,slug,sport,description,invite_code,captain_id,created_at,profiles!teams_captain_id_fkey(display_name)")
      .eq("id", teamId)
      .maybeSingle(),
    supabase
      .from("team_members")
      .select("user_id,role,profiles(display_name)")
      .eq("team_id", teamId),
    supabase
      .from("team_invites")
      .select("id,created_at,invited_user_id,profiles!team_invites_invited_user_id_fkey(display_name)")
      .eq("team_id", teamId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  if (!teamRaw) return null;
  // rename_count se lee en una query lateral mínima para no romper la
  // inference del select principal. Los Database types se regeneran aparte.
  const { data: renameCountRaw } = await supabase
    .from("teams")
    .select("rename_count" as never)
    .eq("id", teamId)
    .maybeSingle();
  const team = teamRaw;
  const renameCount =
    ((renameCountRaw as { rename_count?: number | null } | null)?.rename_count) ?? 0;

  const memberIds = (allMembers ?? []).map((m) => m.user_id as string);
  const { data: stats } =
    memberIds.length > 0
      ? await supabase
          .from("player_stats")
          .select("user_id,current_rating,matches_total,wins")
          .in("user_id", memberIds)
          .eq("sport", SPORT_PRIMARY)
      : { data: [] };

  const statsMap = new Map((stats ?? []).map((s) => [s.user_id as string, s]));

  const captainId = team.captain_id as string;
  const members: TeamMemberLite[] = (allMembers ?? []).map((m) => {
    const profile = m.profiles as { display_name?: string } | null;
    const s = statsMap.get(m.user_id as string);
    const total = (s?.matches_total as number | undefined) ?? 0;
    const wins = (s?.wins as number | undefined) ?? 0;
    const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
    return {
      userId: m.user_id as string,
      name: profile?.display_name ?? "Jugador",
      role: roleLabel(m.role as string, (m.user_id as string) === captainId),
      level: levelFromRating(s?.current_rating as number | null | undefined),
      played: total,
      wr,
      online: false,
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

  return {
    id: team.id as string,
    name: team.name as string,
    tag: ((team.slug as string) ?? "TEAM").slice(0, 3).toUpperCase(),
    sport: SPORT_LABEL[(team.sport as string) ?? "pickleball"] ?? "Multi",
    description: (team.description as string | null | undefined) ?? null,
    inviteCode: (team.invite_code as string | null | undefined) ?? null,
    captainId,
    captainName: captainProfile?.display_name ?? "Capitán",
    founded: String(created.getFullYear()),
    wins: totalWins,
    losses: totalLosses,
    rank: null,
    league: "Sin liga asignada",
    members,
    pendingInvites,
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
    .select("id,name,slug,sport,privacy,clubs(city)")
    .in("privacy", ["public", "invite"])
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
      tag: ((t.slug as string) ?? "TEAM").slice(0, 3).toUpperCase(),
      sport: (t.sport as string | null) ?? null,
      city: club?.city ?? null,
      members: countMap.get(t.id as string) ?? 0,
      privacy: (t.privacy as PublicTeamLite["privacy"]) ?? "public",
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
  const [team, publicTeams, friends] = await Promise.all([
    loadTeam(),
    loadPublicTeams(),
    loadFriends(),
  ]);
  return <TeamScreenView team={team} publicTeams={publicTeams} friends={friends} />;
}
