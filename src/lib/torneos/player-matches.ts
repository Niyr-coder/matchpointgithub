import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { computeGroupStandings, type GroupMatchResult } from "@/lib/tournaments/group-stage";

export type TournamentPlayerMatchView = {
  id: string;
  round: number;
  position: number;
  status: string;
  opponentLabel: string;
  won: boolean | null;
  scoreLabel: string | null;
  scheduledLabel: string | null;
  /** group = fase de grupos; knockout = eliminatoria */
  phase?: "group" | "knockout";
  groupName?: string | null;
};

export type TournamentPlayerGroupView = {
  groupId: string;
  groupName: string;
  advancePerGroup: number;
  standings: Array<{
    registrationId: string;
    label: string;
    rank: number;
    wins: number;
    losses: number;
    involvesMe: boolean;
  }>;
};

export type TournamentBracketSideView = {
  id: string;
  round: number;
  position: number;
  sideALabel: string;
  sideBLabel: string;
  sideAScore: number | null;
  sideBScore: number | null;
  status: string;
  winnerSide: string | null;
  involvesMe: boolean;
};

function formatSetScore(score: unknown): string | null {
  const s = score as { sets?: Array<{ a?: number; b?: number }> } | null;
  if (!s?.sets?.length) return null;
  const parts = s.sets.map((set) => `${set.a ?? 0}–${set.b ?? 0}`);
  return parts.join(", ");
}

// Suma por lado de los sets reportados. El flujo del partner registra una sola
// entrada con los sets ganados ({a:2,b:0}), así que la suma refleja ese tanteo.
// Devuelve null si no hay score registrado.
function sideScores(score: unknown): { a: number | null; b: number | null } {
  const s = score as { sets?: Array<{ a?: number; b?: number }> } | null;
  if (!s?.sets?.length) return { a: null, b: null };
  let a = 0;
  let b = 0;
  for (const set of s.sets) {
    a += set.a ?? 0;
    b += set.b ?? 0;
  }
  return { a, b };
}

function whenLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

async function registrationLabelMap(
  supabase: SupabaseClient<Database>,
  regIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (regIds.length === 0) return out;

  const { data: regs } = await supabase
    .from("registrations")
    .select("id,player_ids,teams(name)")
    .in("id", regIds);

  const playerIds = new Set<string>();
  for (const r of regs ?? []) {
    for (const pid of (r.player_ids as string[] | null) ?? []) playerIds.add(pid);
  }

  const profById = new Map<string, string>();
  if (playerIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", Array.from(playerIds));
    for (const p of profs ?? []) {
      profById.set(p.id as string, (p.display_name as string | null) ?? "Jugador");
    }
  }

  for (const r of regs ?? []) {
    const ids = (r.player_ids as string[] | null) ?? [];
    const team = r.teams as { name?: string } | null;
    if (team?.name) {
      out.set(r.id as string, team.name);
      continue;
    }
    const names = ids.map((id) => profById.get(id) ?? "Jugador");
    out.set(r.id as string, names.join(" + ") || "Por definir");
  }

  return out;
}

type BracketMatchRow = {
  id: string;
  round: number;
  position: number;
  status: string;
  side_a_registration_id: string | null;
  side_b_registration_id: string | null;
  winner_side: string | null;
  score: unknown;
  scheduled_at: string | null;
};

type GroupMatchRow = {
  id: string;
  round_no: number;
  match_no: number;
  status: string;
  side_a_registration_id: string;
  side_b_registration_id: string;
  winner_side: string | null;
  score: unknown;
  scheduled_at: string | null;
  group_id: string;
};

async function loadTournamentPlayerGroupData(
  supabase: SupabaseClient<Database>,
  categoryId: string,
  myRegistrationId: string,
): Promise<{ myMatches: TournamentPlayerMatchView[]; groupView: TournamentPlayerGroupView | null }> {
  const empty = { myMatches: [], groupView: null };

  const { data: cat } = await supabase
    .from("tournament_categories")
    .select("group_playoff_config,stage")
    .eq("id", categoryId)
    .maybeSingle();
  if (!cat) return empty;

  const cfg = cat.group_playoff_config as { advancePerGroup?: number } | null;
  const advancePerGroup = cfg?.advancePerGroup ?? 2;

  const { data: groupsRaw } = await supabase
    .from("tournament_groups")
    .select("id,name,sort_order")
    .eq("category_id", categoryId)
    .order("sort_order");
  if (!groupsRaw?.length) return empty;

  const groupIds = groupsRaw.map((g) => g.id as string);
  const { data: memberRow } = await supabase
    .from("tournament_group_members")
    .select("group_id")
    .eq("registration_id", myRegistrationId)
    .in("group_id", groupIds)
    .maybeSingle();
  if (!memberRow) return empty;

  const myGroupId = memberRow.group_id as string;
  const myGroup = groupsRaw.find((g) => g.id === myGroupId);
  if (!myGroup) return empty;

  const [{ data: members }, { data: matchesRaw }] = await Promise.all([
    supabase
      .from("tournament_group_members")
      .select("registration_id")
      .eq("group_id", myGroupId),
    supabase
      .from("tournament_group_matches")
      .select(
        "id,round_no,match_no,status,side_a_registration_id,side_b_registration_id,winner_side,score,scheduled_at,group_id",
      )
      .eq("group_id", myGroupId)
      .order("round_no")
      .order("match_no"),
  ]);

  const memberIds = (members ?? []).map((m) => m.registration_id as string);
  const matches = (matchesRaw ?? []) as GroupMatchRow[];

  const regIds = new Set<string>(memberIds);
  for (const m of matches) {
    regIds.add(m.side_a_registration_id);
    regIds.add(m.side_b_registration_id);
  }
  const labels = await registrationLabelMap(supabase, Array.from(regIds));
  const labelFor = (regId: string | null) =>
    regId ? (labels.get(regId) ?? "Por definir") : "Por definir";

  const matchResults: GroupMatchResult[] = matches.map((m) => ({
    sideARegistrationId: m.side_a_registration_id,
    sideBRegistrationId: m.side_b_registration_id,
    winnerSide: (m.winner_side as "a" | "b" | "d" | null) ?? null,
    score: (m.score as GroupMatchResult["score"]) ?? null,
    status: m.status,
  }));
  const standings = computeGroupStandings(memberIds, matchResults);

  const groupView: TournamentPlayerGroupView = {
    groupId: myGroupId,
    groupName: myGroup.name as string,
    advancePerGroup,
    standings: standings.map((row) => ({
      registrationId: row.registrationId,
      label: labelFor(row.registrationId),
      rank: row.rank,
      wins: row.wins,
      losses: row.losses,
      involvesMe: row.registrationId === myRegistrationId,
    })),
  };

  const myMatches: TournamentPlayerMatchView[] = matches
    .filter(
      (m) =>
        m.side_a_registration_id === myRegistrationId ||
        m.side_b_registration_id === myRegistrationId,
    )
    .map((m) => {
      const onA = m.side_a_registration_id === myRegistrationId;
      const oppId = onA ? m.side_b_registration_id : m.side_a_registration_id;
      const mySide = onA ? "a" : "b";
      const scored = m.status === "confirmed" || m.status === "reported";
      let won: boolean | null = null;
      if (scored && m.winner_side) {
        won = m.winner_side === mySide;
      }
      return {
        id: m.id,
        round: m.round_no,
        position: m.match_no,
        status: m.status,
        opponentLabel: labelFor(oppId),
        won,
        scoreLabel: scored ? formatSetScore(m.score) : null,
        scheduledLabel: whenLabel(m.scheduled_at),
        phase: "group",
        groupName: myGroup.name as string,
      };
    });

  return { myMatches, groupView };
}

export async function loadTournamentPlayerBracketData(
  supabase: SupabaseClient<Database>,
  tournamentId: string,
  myRegistrationId: string | null,
  categoryId?: string | null,
): Promise<{
  myMatches: TournamentPlayerMatchView[];
  bracketSides: TournamentBracketSideView[];
  groupView: TournamentPlayerGroupView | null;
}> {
  let groupData: { myMatches: TournamentPlayerMatchView[]; groupView: TournamentPlayerGroupView | null } = {
    myMatches: [],
    groupView: null,
  };
  if (myRegistrationId && categoryId) {
    groupData = await loadTournamentPlayerGroupData(supabase, categoryId, myRegistrationId);
  }

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .order("generated_at", { ascending: false })
    .limit(1);

  const bracketId = brackets?.[0]?.id as string | undefined;
  if (!bracketId) {
    return {
      myMatches: groupData.myMatches,
      bracketSides: [],
      groupView: groupData.groupView,
    };
  }

  const { data: raw } = await supabase
    .from("bracket_matches")
    .select(
      "id,round,position,status,side_a_registration_id,side_b_registration_id,winner_side,score,scheduled_at",
    )
    .eq("bracket_id", bracketId)
    .order("round", { ascending: true })
    .order("position", { ascending: true });

  const rows = (raw ?? []) as BracketMatchRow[];
  if (rows.length === 0) {
    return {
      myMatches: groupData.myMatches,
      bracketSides: [],
      groupView: groupData.groupView,
    };
  }

  const regIds = new Set<string>();
  for (const m of rows) {
    if (m.side_a_registration_id) regIds.add(m.side_a_registration_id);
    if (m.side_b_registration_id) regIds.add(m.side_b_registration_id);
  }
  const labels = await registrationLabelMap(supabase, Array.from(regIds));

  const labelFor = (regId: string | null) =>
    regId ? (labels.get(regId) ?? "Por definir") : "Por definir";

  const bracketSides: TournamentBracketSideView[] = rows.map((m) => {
    const sc = sideScores(m.score);
    return {
    id: m.id,
    round: m.round,
    position: m.position,
    sideALabel: labelFor(m.side_a_registration_id),
    sideBLabel: labelFor(m.side_b_registration_id),
    sideAScore: sc.a,
    sideBScore: sc.b,
    status: m.status,
    winnerSide: m.winner_side,
    involvesMe:
      !!myRegistrationId &&
      (m.side_a_registration_id === myRegistrationId ||
        m.side_b_registration_id === myRegistrationId),
    };
  });

  if (!myRegistrationId) {
    return { myMatches: [], bracketSides, groupView: groupData.groupView };
  }

  const knockoutMatches: TournamentPlayerMatchView[] = rows
    .filter(
      (m) =>
        m.side_a_registration_id === myRegistrationId ||
        m.side_b_registration_id === myRegistrationId,
    )
    .map((m) => {
      const onA = m.side_a_registration_id === myRegistrationId;
      const oppId = onA ? m.side_b_registration_id : m.side_a_registration_id;
      const mySide = onA ? "a" : "b";
      let won: boolean | null = null;
      if (m.winner_side) {
        won = m.winner_side === mySide;
      }
      return {
        id: m.id,
        round: m.round,
        position: m.position,
        status: m.status,
        opponentLabel: labelFor(oppId),
        won,
        scoreLabel: formatSetScore(m.score),
        scheduledLabel: whenLabel(m.scheduled_at),
        phase: "knockout",
      };
    });

  return {
    myMatches: [...groupData.myMatches, ...knockoutMatches],
    bracketSides,
    groupView: groupData.groupView,
  };
}
