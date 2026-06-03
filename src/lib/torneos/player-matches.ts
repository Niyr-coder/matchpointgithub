import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

export type TournamentPlayerMatchView = {
  id: string;
  round: number;
  position: number;
  status: string;
  opponentLabel: string;
  won: boolean | null;
  scoreLabel: string | null;
  scheduledLabel: string | null;
};

export type TournamentBracketSideView = {
  id: string;
  round: number;
  position: number;
  sideALabel: string;
  sideBLabel: string;
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

export async function loadTournamentPlayerBracketData(
  supabase: SupabaseClient<Database>,
  tournamentId: string,
  myRegistrationId: string | null,
): Promise<{ myMatches: TournamentPlayerMatchView[]; bracketSides: TournamentBracketSideView[] }> {
  const empty = { myMatches: [], bracketSides: [] };

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .order("generated_at", { ascending: false })
    .limit(1);

  const bracketId = brackets?.[0]?.id as string | undefined;
  if (!bracketId) return empty;

  const { data: raw } = await supabase
    .from("bracket_matches")
    .select(
      "id,round,position,status,side_a_registration_id,side_b_registration_id,winner_side,score,scheduled_at",
    )
    .eq("bracket_id", bracketId)
    .order("round", { ascending: true })
    .order("position", { ascending: true });

  const rows = (raw ?? []) as BracketMatchRow[];
  if (rows.length === 0) return empty;

  const regIds = new Set<string>();
  for (const m of rows) {
    if (m.side_a_registration_id) regIds.add(m.side_a_registration_id);
    if (m.side_b_registration_id) regIds.add(m.side_b_registration_id);
  }
  const labels = await registrationLabelMap(supabase, Array.from(regIds));

  const labelFor = (regId: string | null) =>
    regId ? (labels.get(regId) ?? "Por definir") : "Por definir";

  const bracketSides: TournamentBracketSideView[] = rows.map((m) => ({
    id: m.id,
    round: m.round,
    position: m.position,
    sideALabel: labelFor(m.side_a_registration_id),
    sideBLabel: labelFor(m.side_b_registration_id),
    status: m.status,
    winnerSide: m.winner_side,
    involvesMe:
      !!myRegistrationId &&
      (m.side_a_registration_id === myRegistrationId ||
        m.side_b_registration_id === myRegistrationId),
  }));

  if (!myRegistrationId) return { myMatches: [], bracketSides };

  const myMatches: TournamentPlayerMatchView[] = rows
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
      };
    });

  return { myMatches, bracketSides };
}
