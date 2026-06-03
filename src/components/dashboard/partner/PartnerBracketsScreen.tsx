// Server: bracket en vivo del torneo más reciente (LIVE o próximo) del partner.
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import {
  PartnerBracketsScreenView,
  type BracketsData,
  type BracketMatch,
} from "./PartnerBracketsScreenView";

function formatSetScore(score: unknown): { sa: number | string; sb: number | string } {
  const s = score as { sets?: Array<{ a?: number; b?: number }> } | null;
  if (!s?.sets?.length) return { sa: "-", sb: "-" };
  let aW = 0;
  let bW = 0;
  for (const set of s.sets) {
    if ((set.a ?? 0) > (set.b ?? 0)) aW++;
    else if ((set.b ?? 0) > (set.a ?? 0)) bW++;
  }
  return { sa: aW, sb: bW };
}

async function registrationLabels(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  regIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (regIds.length === 0) return out;

  const { data: regs } = await supabase
    .from("registrations")
    .select("id,team_id,player_ids,teams(name)")
    .in("id", regIds);

  const playerIdSet = new Set<string>();
  for (const r of regs ?? []) {
    for (const p of (r.player_ids as string[] | null) ?? []) playerIdSet.add(p);
  }
  const profById = new Map<string, string>();
  if (playerIdSet.size > 0) {
    const admin = getAdminClient();
    const { data: profs } = await admin
      .from("profiles")
      .select("id,display_name")
      .in("id", Array.from(playerIdSet));
    for (const p of profs ?? []) {
      profById.set(p.id as string, (p.display_name as string | null) ?? "Jugador");
    }
  }

  for (const r of regs ?? []) {
    const pids = (r.player_ids as string[] | null) ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamName = ((r as any).teams?.name as string | undefined) ?? null;
    const first = pids[0] ? profById.get(pids[0]) : null;
    const label = teamName
      ? teamName
      : pids.length > 1 && first
        ? `${first} +${pids.length - 1}`
        : first ?? "Equipo";
    out.set(r.id as string, label);
  }
  return out;
}

async function loadData(): Promise<BracketsData> {
  const empty: BracketsData = {
    partnerId: null,
    tournamentId: null,
    tournamentName: null,
    tournamentFormat: "single_elim",
    canGenerateRandomBracket: true,
    rounds: { r1: [], r2: [], r3: [] },
    roundLabels: { r1: "Cuartos", r2: "Semis", r3: "Final" },
    championLabel: "Por decidir",
    championWhen: "—",
  };

  const partnerId = await resolveActivePartnerId();
  if (!partnerId) return empty;

  const supabase = await getServerClient();
  const now = new Date();

  const { data: tours } = await supabase
    .from("tournaments")
    .select("id,name,format,starts_at,ends_at")
    .eq("partner_id", partnerId)
    .neq("status", "draft")
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true })
    .limit(20);

  let chosen: { id: string; name: string; format: string } | null = null;
  for (const t of tours ?? []) {
    const s = new Date(t.starts_at as string);
    const e = t.ends_at ? new Date(t.ends_at as string) : s;
    if (s <= now && now <= e) {
      chosen = {
        id: t.id as string,
        name: (t.name as string) ?? "—",
        format: (t.format as string) ?? "single_elim",
      };
      break;
    }
  }
  if (!chosen && tours?.[0]) {
    chosen = {
      id: tours[0].id as string,
      name: (tours[0].name as string) ?? "—",
      format: (tours[0].format as string) ?? "single_elim",
    };
  }

  if (!chosen) {
    return { ...empty, partnerId };
  }

  const canGenerateRandomBracket = chosen.format !== "groups_to_knockout";

  const { data: brackets } = await supabase
    .from("brackets")
    .select("id")
    .eq("tournament_id", chosen.id)
    .order("generated_at", { ascending: false })
    .limit(1);
  const bracketId = brackets?.[0]?.id as string | undefined;
  if (!bracketId) {
    return {
      partnerId,
      tournamentId: chosen.id,
      tournamentName: chosen.name,
      tournamentFormat: chosen.format,
      canGenerateRandomBracket,
      rounds: { r1: [], r2: [], r3: [] },
      roundLabels: { r1: "Cuartos", r2: "Semis", r3: "Final" },
      championLabel: "Por decidir",
      championWhen: canGenerateRandomBracket
        ? "—"
        : "Genera la llave desde gestión del torneo",
    };
  }

  const { data: bm } = await supabase
    .from("bracket_matches")
    .select(
      "id,round,position,side_a_registration_id,side_b_registration_id,score,status,winner_side,scheduled_at",
    )
    .eq("bracket_id", bracketId)
    .order("round", { ascending: true })
    .order("position", { ascending: true });

  const regIds = new Set<string>();
  for (const m of bm ?? []) {
    if (m.side_a_registration_id) regIds.add(m.side_a_registration_id as string);
    if (m.side_b_registration_id) regIds.add(m.side_b_registration_id as string);
  }
  const nameByReg = await registrationLabels(supabase, Array.from(regIds));

  type RawMatch = NonNullable<typeof bm>[number];

  function mkMatch(raw: RawMatch): BracketMatch {
    const aName = raw.side_a_registration_id
      ? nameByReg.get(raw.side_a_registration_id as string) ?? "—"
      : "TBD";
    const bName = raw.side_b_registration_id
      ? nameByReg.get(raw.side_b_registration_id as string) ?? "—"
      : "TBD";
    const { sa, sb } = formatSetScore(raw.score);
    const w = raw.winner_side === "a" ? "a" : raw.winner_side === "b" ? "b" : undefined;
    const status = raw.status as string;
    const hasBoth =
      !!raw.side_a_registration_id &&
      !!raw.side_b_registration_id &&
      raw.side_a_registration_id !== raw.side_b_registration_id;
    const reportable =
      hasBoth &&
      status !== "reported" &&
      status !== "confirmed" &&
      status !== "cancelled";
    return {
      id: raw.id as string,
      a: aName,
      b: bName,
      sa,
      sb,
      w,
      live: status === "live",
      status,
      reportable,
    };
  }

  const byRound = new Map<number, RawMatch[]>();
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

  const roundLabels = {
    r1:
      r1.length >= 4 ? "Cuartos" : r1.length === 2 ? "Semis" : r1.length === 1 ? "Final" : "Ronda 1",
    r2: r2.length === 2 ? "Semis" : r2.length === 1 ? "Final" : "Ronda 2",
    r3: "Final",
  };

  let championLabel = "Por decidir";
  let championWhen = "—";
  const finalRaw = sortedRounds.length > 0 ? byRound.get(sortedRounds[sortedRounds.length - 1])?.[0] : null;
  if (finalRaw) {
    if (finalRaw.winner_side === "a" && finalRaw.side_a_registration_id) {
      championLabel = nameByReg.get(finalRaw.side_a_registration_id as string) ?? "Por decidir";
    } else if (finalRaw.winner_side === "b" && finalRaw.side_b_registration_id) {
      championLabel = nameByReg.get(finalRaw.side_b_registration_id as string) ?? "Por decidir";
    }
    if (finalRaw.scheduled_at) {
      const d = new Date(finalRaw.scheduled_at as string);
      championWhen = `Final · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
  }

  return {
    partnerId,
    tournamentId: chosen.id,
    tournamentName: chosen.name,
    tournamentFormat: chosen.format,
    canGenerateRandomBracket,
    rounds: { r1, r2, r3 },
    roundLabels,
    championLabel,
    championWhen,
  };
}

export async function PartnerBracketsScreen() {
  const data = await loadData();
  return <PartnerBracketsScreenView data={data} />;
}
