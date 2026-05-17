// Server: bracket en vivo del torneo más reciente (LIVE o próximo) del partner.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import {
  PartnerBracketsScreenView,
  type BracketsData,
  type BracketMatch,
} from "./PartnerBracketsScreenView";

async function loadData(): Promise<BracketsData> {
  const partnerId = await resolveActivePartnerId();
  if (!partnerId) {
    return { partnerId: null, tournamentId: null, tournamentName: null, rounds: { r1: [], r2: [], r3: [] }, championLabel: "Por decidir", championWhen: "—" };
  }

  const supabase = await getServerClient();
  const now = new Date();

  // Buscar primer torneo activo o próximo
  const { data: tours } = await supabase
    .from("tournaments")
    .select("id,name,starts_at,ends_at")
    .eq("partner_id", partnerId)
    .neq("status", "draft")
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true })
    .limit(20);

  let chosen: { id: string; name: string } | null = null;
  for (const t of tours ?? []) {
    const s = new Date(t.starts_at as string);
    const e = new Date(t.ends_at as string);
    if (s <= now && now <= e) {
      chosen = { id: t.id as string, name: (t.name as string) ?? "—" };
      break;
    }
  }
  if (!chosen && tours && tours[0]) {
    chosen = { id: tours[0].id as string, name: (tours[0].name as string) ?? "—" };
  }

  if (!chosen) {
    return {
      partnerId,
      tournamentId: null,
      tournamentName: null,
      rounds: { r1: [], r2: [], r3: [] },
      championLabel: "Por decidir",
      championWhen: "—",
    };
  }

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id")
    .eq("tournament_id", chosen.id)
    .limit(1);
  const bracketId = brackets?.[0]?.id as string | undefined;
  if (!bracketId) {
    return {
      partnerId,
      tournamentId: chosen.id,
      tournamentName: chosen.name,
      rounds: { r1: [], r2: [], r3: [] },
      championLabel: "Por decidir",
      championWhen: "—",
    };
  }

  const { data: bm } = await supabase
    .from("bracket_matches")
    .select("id,round,position,side_a_registration_id,side_b_registration_id,score,status,winner_side,scheduled_at")
    .eq("bracket_id", bracketId)
    .order("round", { ascending: true })
    .order("position", { ascending: true });

  // Para nombrar equipos: por team_id si está disponible.
  const regIds = new Set<string>();
  for (const m of bm ?? []) {
    if (m.side_a_registration_id) regIds.add(m.side_a_registration_id as string);
    if (m.side_b_registration_id) regIds.add(m.side_b_registration_id as string);
  }
  const teamNameByReg = new Map<string, string>();
  if (regIds.size > 0) {
    const { data: regs } = await supabase
      .from("registrations")
      .select("id,team_id,teams(name)")
      .in("id", Array.from(regIds));
    for (const r of regs ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teamName = ((r as any).teams?.name as string) ?? "Equipo";
      teamNameByReg.set(r.id as string, teamName);
    }
  }

  function mkMatch(raw: typeof bm extends (infer U)[] | null ? U : never): BracketMatch {
    const aName = raw.side_a_registration_id
      ? teamNameByReg.get(raw.side_a_registration_id as string) ?? "—"
      : "TBD";
    const bName = raw.side_b_registration_id
      ? teamNameByReg.get(raw.side_b_registration_id as string) ?? "—"
      : "TBD";
    const score = raw.score as { a?: number; b?: number } | null;
    const sa = score?.a != null ? score.a : "-";
    const sb = score?.b != null ? score.b : "-";
    const w = raw.winner_side === "a" ? "a" : raw.winner_side === "b" ? "b" : undefined;
    // mp_match_status no expone un estado "live" explícito; dejarlo en false hasta tener tracking.
    const live = false;
    return { a: aName, b: bName, sa, sb, w, live };
  }

  const byRound = new Map<number, typeof bm>();
  for (const m of bm ?? []) {
    const r = m.round as number;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(m);
  }
  const sortedRounds = Array.from(byRound.keys()).sort((a, b) => a - b);
  const r1raw = sortedRounds[0] != null ? byRound.get(sortedRounds[0]) ?? [] : [];
  const r2raw = sortedRounds[1] != null ? byRound.get(sortedRounds[1]) ?? [] : [];
  const r3raw = sortedRounds[2] != null ? byRound.get(sortedRounds[2]) ?? [] : [];

  const r1 = r1raw.map(mkMatch);
  const r2 = r2raw.map(mkMatch);
  const r3 = r3raw.map(mkMatch);

  // Champion: si la última ronda tiene un ganador, su nombre; si no, "Por decidir".
  let championLabel = "Por decidir";
  let championWhen = "—";
  const finalMatch = r3raw[0];
  if (finalMatch) {
    if (finalMatch.winner_side === "a" && finalMatch.side_a_registration_id) {
      championLabel = teamNameByReg.get(finalMatch.side_a_registration_id as string) ?? "Por decidir";
    } else if (finalMatch.winner_side === "b" && finalMatch.side_b_registration_id) {
      championLabel = teamNameByReg.get(finalMatch.side_b_registration_id as string) ?? "Por decidir";
    }
    if (finalMatch.scheduled_at) {
      const d = new Date(finalMatch.scheduled_at as string);
      championWhen = `Final · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
  }

  return {
    partnerId,
    tournamentId: chosen.id,
    tournamentName: chosen.name,
    rounds: { r1, r2, r3 },
    championLabel,
    championWhen,
  };
}

export async function PartnerBracketsScreen() {
  const data = await loadData();
  return <PartnerBracketsScreenView data={data} />;
}
