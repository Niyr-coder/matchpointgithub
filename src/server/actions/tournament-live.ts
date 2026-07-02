"use server";

import "server-only";

import { randomUUID } from "crypto";
import { z } from "zod";
import { getAdminClient } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { UuidSchema } from "@/lib/schemas/common";
import { requireTournamentEditor } from "@/server/actions/tournaments";

const TournamentIdSchema = z.object({ tournamentId: UuidSchema });

export async function ensureTournamentDisplayToken(
  input: unknown,
): Promise<ActionResult<{ token: string; slug: string }>> {
  return runAction(TournamentIdSchema, input, async ({ tournamentId }) => {
    await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    const { data: tRaw } = await admin
      .from("tournaments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id,slug,display_token" as any)
      .eq("id", tournamentId)
      .single();
    if (!tRaw) throw new MpError("TOURNAMENT.NOT_FOUND", "Torneo no encontrado", 404);
    const tRow = tRaw as unknown as { id: string; slug: string; display_token: string | null };

    let token = tRow.display_token;
    if (!token) {
      token = randomUUID();
      const { error } = await admin
        .from("tournaments")
        .update({ display_token: token } as never)
        .eq("id", tournamentId);
      if (error) throw new MpError("TOURNAMENT.TOKEN_FAILED", error.message, 500);
    }

    return { token, slug: tRow.slug };
  });
}

export async function rotateTournamentDisplayToken(
  input: unknown,
): Promise<ActionResult<{ token: string; slug: string }>> {
  return runAction(TournamentIdSchema, input, async ({ tournamentId }) => {
    await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();
    const token = randomUUID();
    const { data: row, error } = await admin
      .from("tournaments")
      .update({ display_token: token } as never)
      .eq("id", tournamentId)
      .select("slug")
      .single();
    if (error || !row) throw new MpError("TOURNAMENT.TOKEN_FAILED", error?.message ?? "Error", 500);
    return { token, slug: row.slug as string };
  });
}

export type TournamentLiveMatch = {
  id: string;
  labelA: string;
  labelB: string;
  scoreA: string;
  scoreB: string;
  sets: Array<{ a: number; b: number }>;
  status: string;
  phase: "group" | "knockout";
  /** Nombre de la categoría del partido (null = bracket global legacy). */
  categoryName: string | null;
  groupName?: string;
  courtId?: string;
  courtLabel?: string;
  scheduledAt?: string | null;
};

export type TournamentLiveGroupTable = {
  categoryName: string;
  groupName: string;
  rows: Array<{ rank: number; label: string; wins: number; sets: string }>;
};

export type TournamentLiveCourt = {
  courtId: string;
  courtLabel: string;
  current: TournamentLiveMatch | null;
  next: TournamentLiveMatch | null;
};

export type TournamentLiveBracketMatch = {
  id: string;
  labelA: string;
  labelB: string;
  scoreA: string;
  scoreB: string;
  sets: Array<{ a: number; b: number }>;
  status: string;
  winner: "a" | "b" | null;
};

export type TournamentLiveBracketRound = {
  name: string;
  matches: TournamentLiveBracketMatch[];
};

/** Un cuadro de eliminatoria por categoría (categoryName null = bracket global legacy). */
export type TournamentLiveBracketEntry = {
  categoryName: string | null;
  rounds: TournamentLiveBracketRound[];
  finalists: { a: string; b: string } | null;
  championLabel: string | null;
};

export type TournamentLiveChampion = {
  categoryName: string | null;
  championLabel: string;
  finalists: { a: string; b: string } | null;
};

export type TournamentLiveStandout = {
  label: string;
  setsWon: number;
  matchesWon: number;
};

export type TournamentLivePathStep = {
  round: string;
  opponent: string;
  result: string;
  status: string;
};

export type TournamentLivePath = {
  label: string;
  steps: TournamentLivePathStep[];
};

export type TournamentLiveTeam = {
  registrationId: string;
  label: string;
  categoryName: string | null;
};

export type TournamentLiveSponsor = {
  placementId: string;
  headline: string;
  sponsorName: string;
  logoUrl: string | null;
  targetUrl: string | null;
};

export type TournamentLiveDisplay = {
  tournamentId: string;
  tournamentName: string;
  slug: string;
  format: string;
  phase: "groups" | "knockout";
  categoryNames: string[];
  liveMatches: TournamentLiveMatch[];
  recentMatches: TournamentLiveMatch[];
  upcomingMatches: TournamentLiveMatch[];
  courts: TournamentLiveCourt[];
  groupTables: TournamentLiveGroupTable[];
  /** Un cuadro por categoría con bracket generado (más reciente por categoría). */
  brackets: TournamentLiveBracketEntry[];
  standouts: TournamentLiveStandout[];
  paths: TournamentLivePath[];
  /** Campeones por categoría (bracket con final definida, o liga completa). */
  champions: TournamentLiveChampion[];
  teams: TournamentLiveTeam[];
  sponsors: TournamentLiveSponsor[];
};

const LiveQuerySchema = z.object({
  slug: z.string().min(1),
  token: z.string().uuid(),
});

function formatSetScore(score: unknown): { a: string; b: string } {
  const s = score as { sets?: Array<{ a?: number; b?: number }> } | null;
  if (!s?.sets?.length) return { a: "-", b: "-" };
  let aW = 0;
  let bW = 0;
  for (const set of s.sets) {
    if ((set.a ?? 0) > (set.b ?? 0)) aW++;
    else if ((set.b ?? 0) > (set.a ?? 0)) bW++;
  }
  return { a: String(aW), b: String(bW) };
}

function parseSets(score: unknown): Array<{ a: number; b: number }> {
  const s = score as { sets?: Array<{ a?: number; b?: number }> } | null;
  if (!s?.sets?.length) return [];
  return s.sets.map((x) => ({ a: Number(x.a) || 0, b: Number(x.b) || 0 }));
}

function roundName(matchesInRound: number): string {
  switch (matchesInRound) {
    case 1:
      return "Final";
    case 2:
      return "Semifinal";
    case 4:
      return "Cuartos";
    case 8:
      return "Octavos";
    case 16:
      return "16avos";
    default:
      return `Ronda de ${matchesInRound * 2}`;
  }
}

type TeamStat = { label: string; setsWon: number; matchesWon: number };

function tallyTeam(
  stats: Map<string, TeamStat>,
  regId: string | null,
  label: string,
  sets: Array<{ a: number; b: number }>,
  side: "a" | "b",
  winnerSide: string | null,
) {
  if (!regId) return;
  let e = stats.get(regId);
  if (!e) {
    e = { label, setsWon: 0, matchesWon: 0 };
    stats.set(regId, e);
  }
  if (label && label !== "—" && label !== "Equipo" && label !== "TBD") e.label = label;
  for (const s of sets) {
    if (side === "a" ? s.a > s.b : s.b > s.a) e.setsWon += 1;
  }
  if (winnerSide === side) e.matchesWon += 1;
}

/** Carga todos los registrations del torneo en 2 queries y devuelve un mapa regId → label. */
async function buildRegistrationLabelMap(
  admin: ReturnType<typeof getAdminClient>,
  tournamentId: string,
): Promise<Map<string, string>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: regs } = await admin
    .from("registrations")
    .select("id,team_id,player_ids,teams(name)" as any)
    .eq("tournament_id", tournamentId) as unknown as {
      data: Array<{ id: string; team_id: string | null; player_ids: string[] | null; teams: { name: string } | null }> | null;
    };

  // Fetch guest_names por separado (no está en los tipos generados).
  const regIds = (regs ?? []).map((r) => r.id);
  const guestsByRegId = new Map<string, string[]>();
  if (regIds.length > 0) {
    const { data: gr } = await admin
      .from("registrations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id,guest_names" as any)
      .in("id", regIds) as unknown as { data: Array<{ id: string; guest_names: string[] | null }> | null };
    for (const g of gr ?? []) {
      if (g.guest_names?.length) guestsByRegId.set(g.id, g.guest_names);
    }
  }

  const playerIdSet = new Set<string>();
  for (const r of regs ?? []) {
    for (const p of r.player_ids ?? []) playerIdSet.add(p);
  }

  const profById = new Map<string, string>();
  if (playerIdSet.size > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id,display_name")
      .in("id", Array.from(playerIdSet));
    for (const p of profs ?? []) {
      profById.set(p.id as string, (p.display_name as string | null) ?? "Jugador");
    }
  }

  const out = new Map<string, string>();
  for (const r of regs ?? []) {
    const pids = r.player_ids ?? [];
    const teamName = r.teams?.name ?? null;
    const guests = guestsByRegId.get(r.id) ?? [];
    const label = teamName
      ? teamName
      : pids.length > 0
        ? pids.map((pid) => profById.get(pid) ?? "Jugador").join(" / ")
        : guests.length > 0
          ? guests.join(" / ")
          : "Equipo";
    out.set(r.id, label);
  }
  return out;
}

/** Lectura pública read-only para pantalla TV (valida token). */
export async function getTournamentLiveDisplay(
  input: unknown,
): Promise<ActionResult<TournamentLiveDisplay>> {
  return runAction(LiveQuerySchema, input, async ({ slug, token }) => {
    const admin = getAdminClient();
    const { data: tRaw } = await admin
      .from("tournaments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id,slug,name,format,display_token,status" as any)
      .eq("slug", slug)
      .maybeSingle();
    const t = tRaw as unknown as {
      id: string;
      slug: string;
      name: string;
      format: string;
      display_token: string | null;
      status: string;
    } | null;
    if (!t || t.display_token !== token) {
      throw new MpError("TOURNAMENT.LIVE_FORBIDDEN", "Enlace no válido", 403);
    }
    // El link es privado (token): draft SÍ se permite para que el organizador
    // monte y pruebe la pantalla del venue antes de publicar — el cliente
    // muestra el standby "Los partidos en vivo aparecerán aquí". Cancelled
    // sigue bloqueado (no hay nada que transmitir).
    if (t.status === "cancelled") {
      throw new MpError("TOURNAMENT.LIVE_UNAVAILABLE", "Torneo no disponible", 404);
    }

    const tournamentId = t.id;

    // Carga todos los registrations del torneo en 2 queries para evitar N+1 por grupo/bracket.
    // Paralelizamos con la query de categorías y la de inscritos aceptados.
    const [nameByReg, { data: cats }, { data: acceptedRegsRaw }, { data: sponsorRaw }] = await Promise.all([
      buildRegistrationLabelMap(admin, tournamentId),
      admin
        .from("tournament_categories")
        .select("id,name,stage")
        .eq("tournament_id", tournamentId),
      admin
        .from("registrations")
        .select("id,category_id")
        .eq("tournament_id", tournamentId)
        .eq("status", "accepted")
        .order("created_at", { ascending: true }),
      admin
        .from("active_sponsor_placements")
        .select("placement_id,headline,sponsor_name,sponsor_logo_url,target_url")
        .eq("slot_key", "tv_ticker"),
    ]);

    const allMatches: TournamentLiveMatch[] = [];
    const groupTables: TournamentLiveGroupTable[] = [];
    const categoryNames: string[] = [];
    const teamStats = new Map<string, TeamStat>();
    const catNameById = new Map<string, string>();
    for (const c of cats ?? []) catNameById.set(c.id as string, c.name as string);
    // Rank 1 por categoría de UN solo grupo (formato liga) — para derivar el
    // campeón cuando la categoría cierra sin bracket (stage 'complete').
    const ligaChampionByCat = new Map<string, string>();

    // Bulk fetch de grupos/miembros/partidos en 3 queries totales — antes era
    // un N+1 de 2 queries POR grupo × categorías, re-ejecutado por cada
    // refresh del TV display (audit de costos 2026-07-01).
    const catIds = (cats ?? []).map((c) => c.id as string);
    const { data: allGroupsRaw } = catIds.length
      ? await admin
          .from("tournament_groups")
          .select("id,name,sort_order,category_id")
          .in("category_id", catIds)
      : { data: [] as unknown[] };
    type GroupRow = { id: string; name: string; sort_order: number; category_id: string };
    const allGroups = (allGroupsRaw ?? []) as unknown as GroupRow[];
    const groupIds = allGroups.map((g) => g.id);

    type GmRow = Record<string, unknown>;
    const [{ data: allMembersRaw }, { data: allGmRaw }] = groupIds.length
      ? await Promise.all([
          admin
            .from("tournament_group_members")
            .select("registration_id,group_id")
            .in("group_id", groupIds),
          admin
            .from("tournament_group_matches")
            .select(
              "id,group_id,side_a_registration_id,side_b_registration_id,score,status,winner_side,scheduled_at,court_id,courts(code,name)",
            )
            .in("group_id", groupIds),
        ])
      : [{ data: [] as unknown[] }, { data: [] as unknown[] }];

    const membersByGroup = new Map<string, string[]>();
    for (const m of (allMembersRaw ?? []) as Array<{ registration_id: string; group_id: string }>) {
      const list = membersByGroup.get(m.group_id) ?? [];
      list.push(m.registration_id);
      membersByGroup.set(m.group_id, list);
    }
    const gmByGroup = new Map<string, GmRow[]>();
    for (const m of (allGmRaw ?? []) as GmRow[]) {
      const gid = m.group_id as string;
      const list = gmByGroup.get(gid) ?? [];
      list.push(m);
      gmByGroup.set(gid, list);
    }

    for (const cat of cats ?? []) {
      const categoryName = cat.name as string;
      categoryNames.push(categoryName);
      const groups = allGroups
        .filter((g) => g.category_id === (cat.id as string))
        .sort((a, b) => a.sort_order - b.sort_order);

      for (const g of groups) {
        const memberIds = membersByGroup.get(g.id) ?? [];
        const gm = gmByGroup.get(g.id) ?? [];

        for (const m of gm ?? []) {
          const { a, b } = formatSetScore(m.score);
          const sets = parseSets(m.score);
          const labelA = nameByReg.get(m.side_a_registration_id as string) ?? "—";
          const labelB = nameByReg.get(m.side_b_registration_id as string) ?? "—";
          allMatches.push({
            id: m.id as string,
            labelA,
            labelB,
            scoreA: a,
            scoreB: b,
            sets,
            status: m.status as string,
            phase: "group",
            categoryName,
            groupName: g.name as string,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            courtId: ((m as any).court_id as string | null) ?? undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            courtLabel: ((m as any).courts?.code as string) ?? ((m as any).courts?.name as string) ?? undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            scheduledAt: ((m as any).scheduled_at as string | null) ?? null,
          });
          const ws = (m.winner_side as string | null) ?? null;
          tallyTeam(teamStats, m.side_a_registration_id as string | null, labelA, sets, "a", ws);
          tallyTeam(teamStats, m.side_b_registration_id as string | null, labelB, sets, "b", ws);
        }

        if (memberIds.length > 0 && (gm?.length ?? 0) > 0) {
          const { computeGroupStandings } = await import("@/lib/tournaments/group-stage");
          const standings = computeGroupStandings(
            memberIds,
            (gm ?? []).map((m) => ({
              sideARegistrationId: m.side_a_registration_id as string,
              sideBRegistrationId: m.side_b_registration_id as string,
              winnerSide: (m.winner_side as "a" | "b" | "d" | null) ?? null,
              score: (m.score as { sets?: Array<{ a: number; b: number }> }) ?? null,
              status: m.status as string,
            })),
          );
          if (groups.length === 1 && standings.length > 0) {
            const top = standings.find((s) => s.rank === 1) ?? standings[0]!;
            ligaChampionByCat.set(cat.id as string, nameByReg.get(top.registrationId) ?? "—");
          }
          groupTables.push({
            categoryName,
            groupName: g.name as string,
            rows: standings.slice(0, 6).map((s) => ({
              rank: s.rank,
              label: nameByReg.get(s.registrationId) ?? "—",
              wins: s.wins,
              sets: `${s.setsWon}-${s.setsLost}`,
            })),
          });
        }
      }
    }

    // TODOS los brackets del torneo — uno por categoría (el más reciente por
    // categoría si hubiera duplicados). category_id null = bracket global legacy.
    const { data: bracketsRaw } = await admin
      .from("brackets")
      .select("id,category_id")
      .eq("tournament_id", tournamentId)
      .order("generated_at", { ascending: false });
    type BracketRow = { id: string; category_id: string | null };
    const bracketByCatKey = new Map<string, BracketRow>();
    for (const b of (bracketsRaw ?? []) as unknown as BracketRow[]) {
      const key = b.category_id ?? "__global__";
      if (!bracketByCatKey.has(key)) bracketByCatKey.set(key, b);
    }
    // Orden estable: bracket global legacy primero, luego según el orden de categorías.
    const catOrder = new Map<string, number>();
    (cats ?? []).forEach((c, i) => catOrder.set(c.id as string, i));
    const activeBrackets = Array.from(bracketByCatKey.values()).sort(
      (x, y) =>
        (x.category_id ? catOrder.get(x.category_id) ?? 999 : -1) -
        (y.category_id ? catOrder.get(y.category_id) ?? 999 : -1),
    );

    const bracketEntries: TournamentLiveBracketEntry[] = [];
    const champions: TournamentLiveChampion[] = [];
    const paths: TournamentLivePath[] = [];
    const lbl = (id: string | null) => (id ? nameByReg.get(id) ?? "—" : "TBD");

    if (activeBrackets.length > 0) {
      // Partidos de TODOS los brackets en una sola query (nada de N+1 por categoría).
      const { data: bmRaw } = await admin
        .from("bracket_matches")
        .select(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "id,bracket_id,round,position,side_a_registration_id,side_b_registration_id,score,status,winner_side,is_bronze,scheduled_at,court_id,courts(code,name)" as any,
        )
        .in("bracket_id", activeBrackets.map((b) => b.id))
        .eq("is_bronze" as never, false)
        .order("round", { ascending: true });
      type BmRow = {
        id: string;
        bracket_id: string;
        round: number;
        position: number | null;
        side_a_registration_id: string | null;
        side_b_registration_id: string | null;
        score: unknown;
        status: string;
        winner_side: string | null;
        scheduled_at: string | null;
        court_id: string | null;
        courts?: { code?: string; name?: string } | null;
      };
      const allBm = (bmRaw ?? []) as unknown as BmRow[];
      const bmByBracket = new Map<string, BmRow[]>();
      for (const m of allBm) {
        const list = bmByBracket.get(m.bracket_id) ?? [];
        list.push(m);
        bmByBracket.set(m.bracket_id, list);
      }

      for (const bracket of activeBrackets) {
        const bracketCategoryName = bracket.category_id
          ? catNameById.get(bracket.category_id) ?? null
          : null;
        const bm = bmByBracket.get(bracket.id) ?? [];

        for (const m of bm) {
          const { a, b } = formatSetScore(m.score);
          const sets = parseSets(m.score);
          const labelA = lbl(m.side_a_registration_id);
          const labelB = lbl(m.side_b_registration_id);
          allMatches.push({
            id: m.id,
            labelA,
            labelB,
            scoreA: a,
            scoreB: b,
            sets,
            status: m.status,
            phase: "knockout",
            categoryName: bracketCategoryName,
            courtId: m.court_id ?? undefined,
            courtLabel: m.courts?.code ?? m.courts?.name ?? undefined,
            scheduledAt: m.scheduled_at ?? null,
          });
          const ws = m.winner_side ?? null;
          tallyTeam(teamStats, m.side_a_registration_id, labelA, sets, "a", ws);
          tallyTeam(teamStats, m.side_b_registration_id, labelB, sets, "b", ws);
        }

        // Estructura del cuadro por ronda (ascendente → Final al final)
        const byRound = new Map<number, BmRow[]>();
        for (const m of bm) {
          if (!byRound.has(m.round)) byRound.set(m.round, []);
          byRound.get(m.round)!.push(m);
        }
        const sortedRounds = Array.from(byRound.keys()).sort((x, y) => x - y);
        const rounds: TournamentLiveBracketRound[] = [];
        for (const r of sortedRounds) {
          const ms = byRound.get(r)!.slice().sort((x, y) => (x.position ?? 0) - (y.position ?? 0));
          rounds.push({
            name: roundName(ms.length),
            matches: ms.map((m) => {
              const { a, b } = formatSetScore(m.score);
              return {
                id: m.id,
                labelA: lbl(m.side_a_registration_id),
                labelB: lbl(m.side_b_registration_id),
                scoreA: a,
                scoreB: b,
                sets: parseSets(m.score),
                status: m.status,
                winner: m.winner_side === "a" || m.winner_side === "b" ? m.winner_side : null,
              };
            }),
          });
        }

        // Finalistas + campeón (ronda más alta = Final)
        let finalists: { a: string; b: string } | null = null;
        let championLabel: string | null = null;
        const maxRound = sortedRounds.length ? sortedRounds[sortedRounds.length - 1]! : null;
        const finalMatch = maxRound != null ? (byRound.get(maxRound) ?? [])[0] : undefined;
        if (finalMatch) {
          finalists = { a: lbl(finalMatch.side_a_registration_id), b: lbl(finalMatch.side_b_registration_id) };
          if (finalMatch.status === "reported" || finalMatch.status === "confirmed") {
            if (finalMatch.winner_side === "a" && finalMatch.side_a_registration_id) {
              championLabel = lbl(finalMatch.side_a_registration_id);
            } else if (finalMatch.winner_side === "b" && finalMatch.side_b_registration_id) {
              championLabel = lbl(finalMatch.side_b_registration_id);
            }
          }
        }

        bracketEntries.push({ categoryName: bracketCategoryName, rounds, finalists, championLabel });
        if (championLabel) {
          champions.push({ categoryName: bracketCategoryName, championLabel, finalists });
        }

        // Camino al título: pasos por registration (de los finalistas del cuadro)
        const stepsByReg = new Map<string, TournamentLivePathStep[]>();
        for (const r of sortedRounds) {
          const ms = byRound.get(r)!;
          const rName = roundName(ms.length);
          for (const m of ms) {
            const { a, b } = formatSetScore(m.score);
            const pushStep = (reg: string | null, oppLabel: string, side: "a" | "b") => {
              if (!reg) return;
              const mine = side === "a" ? a : b;
              const theirs = side === "a" ? b : a;
              let result: string;
              if (m.status === "confirmed" || m.status === "reported") {
                result = `${m.winner_side === side ? "Ganó" : "Perdió"} ${mine}-${theirs}`;
              } else if (m.status === "live") {
                result = `En juego ${mine}-${theirs}`;
              } else {
                result = "Por jugar";
              }
              if (!stepsByReg.has(reg)) stepsByReg.set(reg, []);
              stepsByReg.get(reg)!.push({ round: rName, opponent: oppLabel, result, status: m.status });
            };
            pushStep(m.side_a_registration_id, lbl(m.side_b_registration_id), "a");
            pushStep(m.side_b_registration_id, lbl(m.side_a_registration_id), "b");
          }
        }
        const pathRegs: string[] = [];
        if (finalMatch?.side_a_registration_id) pathRegs.push(finalMatch.side_a_registration_id);
        if (finalMatch?.side_b_registration_id) pathRegs.push(finalMatch.side_b_registration_id);
        for (const reg of pathRegs.slice(0, 2)) {
          const steps = stepsByReg.get(reg) ?? [];
          if (steps.length > 0) paths.push({ label: lbl(reg), steps });
        }
      }
    }

    // Campeones de liga: categorías con stage 'complete' SIN bracket propio (y sin
    // bracket global legacy) → rank 1 de standings del grupo único de la categoría.
    const hasGlobalBracket = bracketByCatKey.has("__global__");
    for (const cat of cats ?? []) {
      const catId = cat.id as string;
      if ((cat.stage as string | null) !== "complete") continue;
      if (hasGlobalBracket || bracketByCatKey.has(catId)) continue;
      const ligaChampion = ligaChampionByCat.get(catId);
      if (ligaChampion) {
        champions.push({ categoryName: cat.name as string, championLabel: ligaChampion, finalists: null });
      }
    }

    const standouts = Array.from(teamStats.values())
      .filter((s) => s.setsWon > 0)
      .sort((a, b) => b.setsWon - a.setsWon || b.matchesWon - a.matchesWon)
      .slice(0, 5);
    const phase: "groups" | "knockout" = bracketEntries.some((e) => e.rounds.length > 0)
      ? "knockout"
      : "groups";

    // Lista de equipos inscritos aceptados para la escena "teams" del TV.
    const teams: TournamentLiveTeam[] = (acceptedRegsRaw ?? []).map((r) => ({
      registrationId: r.id as string,
      label: nameByReg.get(r.id as string) ?? "—",
      categoryName: r.category_id ? catNameById.get(r.category_id as string) ?? null : null,
    }));

    // Derivar listas para la pantalla
    const liveMatches = allMatches.filter((m) => m.status === "live").slice(0, 8);
    const recentMatches = allMatches
      .filter((m) => m.status === "reported" || m.status === "confirmed")
      .slice(-12)
      .reverse();
    const upcomingMatches = allMatches
      .filter((m) => m.status === "scheduled")
      .sort((a, b) => (a.scheduledAt ?? "~").localeCompare(b.scheduledAt ?? "~"))
      .slice(0, 12);

    // Tablero por cancha: partido actual (en juego) + siguiente (programado)
    const courtMap = new Map<string, TournamentLiveCourt>();
    for (const m of allMatches) {
      if (!m.courtId) continue;
      let c = courtMap.get(m.courtId);
      if (!c) {
        c = { courtId: m.courtId, courtLabel: m.courtLabel ?? "Cancha", current: null, next: null };
        courtMap.set(m.courtId, c);
      }
      if (m.courtLabel && c.courtLabel === "Cancha") c.courtLabel = m.courtLabel;
      if (m.status === "live") {
        if (!c.current) c.current = m;
      } else if (m.status === "scheduled") {
        if (!c.next || (m.scheduledAt && (!c.next.scheduledAt || m.scheduledAt < c.next.scheduledAt))) {
          c.next = m;
        }
      }
    }
    const courts = Array.from(courtMap.values())
      .filter((c) => c.current || c.next)
      .sort((a, b) => a.courtLabel.localeCompare(b.courtLabel, "es", { numeric: true }));

    const sponsors: TournamentLiveSponsor[] = (sponsorRaw ?? [])
      .filter((s) => s.placement_id && s.headline)
      .map((s) => ({
        placementId: s.placement_id!,
        headline: s.headline!,
        sponsorName: s.sponsor_name ?? "",
        logoUrl: s.sponsor_logo_url ?? null,
        targetUrl: s.target_url ?? null,
      }));

    return {
      tournamentId,
      tournamentName: t.name,
      slug: t.slug,
      format: t.format,
      phase,
      categoryNames,
      liveMatches,
      recentMatches,
      upcomingMatches,
      courts,
      groupTables,
      brackets: bracketEntries,
      standouts,
      paths,
      champions,
      teams,
      sponsors,
    };
  });
}
