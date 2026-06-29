"use server";

import "server-only";

import { randomUUID } from "crypto";
import { z } from "zod";
import { getAdminClient } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

const TournamentIdSchema = z.object({ tournamentId: UuidSchema });

async function requireTournamentEditor(tournamentId: string) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");

  const { data: t } = await supabase
    .from("tournaments")
    .select("partner_id")
    .eq("id", tournamentId)
    .single();
  if (!t) throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);

  const { data: adminRow } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (adminRow) return;
  const partnerId = (t.partner_id as string | null) ?? null;
  if (!partnerId) throw new AuthError("AUTH.ROLE_REQUIRED", "Torneo sin partner — solo admin");
  const { data: member } = await supabase
    .from("partner_members")
    .select("user_id")
    .eq("partner_id", partnerId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!member) throw new AuthError("AUTH.ROLE_REQUIRED", "Sin permiso para editar este torneo");
}

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
};

export type TournamentLiveSponsor = {
  placementId: string;
  headline: string;
  sponsorName: string;
  logoUrl: string | null;
  targetUrl: string | null;
};

export type TournamentLiveGlobalStanding = {
  rank: number;
  label: string;
  wins: number;
  losses: number;
  played: number;
  setsWon: number;
  setsLost: number;
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
  bracketRounds: TournamentLiveBracketRound[];
  finalists: { a: string; b: string } | null;
  standouts: TournamentLiveStandout[];
  paths: TournamentLivePath[];
  championLabel: string | null;
  teams: TournamentLiveTeam[];
  globalStandings: TournamentLiveGlobalStanding[];
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
  const { data: regs } = await admin
    .from("registrations")
    .select("id,team_id,player_ids,teams(name)")
    .eq("tournament_id", tournamentId);

  const playerIdSet = new Set<string>();
  for (const r of regs ?? []) {
    for (const p of (r.player_ids as string[] | null) ?? []) playerIdSet.add(p);
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
    const pids = (r.player_ids as string[] | null) ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamName = ((r as any).teams?.name as string | undefined) ?? null;
    const first = pids[0] ? profById.get(pids[0]) : null;
    const label = teamName
      ? teamName
      : pids.length > 0
        ? pids.map((pid) => profById.get(pid) ?? "Jugador").join(" / ")
        : "Equipo";
    out.set(r.id as string, label);
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
    if (t.status === "draft" || t.status === "cancelled") {
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
        .select("id")
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
    // Acumula filas brutas de standings para construir la tabla global al final.
    type RawStandingRow = { registrationId: string; wins: number; losses: number; played: number; setsWon: number; setsLost: number };
    const allGroupStandingRows: RawStandingRow[] = [];

    for (const cat of cats ?? []) {
      const categoryName = cat.name as string;
      categoryNames.push(categoryName);
      const { data: groups } = await admin
        .from("tournament_groups")
        .select("id,name,sort_order")
        .eq("category_id", cat.id as string)
        .order("sort_order", { ascending: true });

      for (const g of groups ?? []) {
        const { data: members } = await admin
          .from("tournament_group_members")
          .select("registration_id")
          .eq("group_id", g.id as string);
        const memberIds = (members ?? []).map((m) => m.registration_id as string);

        const { data: gm } = await admin
          .from("tournament_group_matches")
          .select(
            "id,side_a_registration_id,side_b_registration_id,score,status,winner_side,scheduled_at,court_id,courts(code,name)",
          )
          .eq("group_id", g.id as string);

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
          for (const s of standings) {
            allGroupStandingRows.push({
              registrationId: s.registrationId,
              wins: s.wins,
              losses: s.losses,
              played: s.played,
              setsWon: s.setsWon,
              setsLost: s.setsLost,
            });
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

    const { data: brackets } = await admin
      .from("brackets")
      .select("id")
      .eq("tournament_id", tournamentId)
      .order("generated_at", { ascending: false })
      .limit(1);
    const bracketId = brackets?.[0]?.id as string | undefined;
    let championLabel: string | null = null;
    const bracketRounds: TournamentLiveBracketRound[] = [];
    let finalists: { a: string; b: string } | null = null;
    const paths: TournamentLivePath[] = [];

    if (bracketId) {
      const { data: bmRaw } = await admin
        .from("bracket_matches")
        .select(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "id,round,position,side_a_registration_id,side_b_registration_id,score,status,winner_side,is_bronze,scheduled_at,court_id,courts(code,name)" as any,
        )
        .eq("bracket_id", bracketId)
        .eq("is_bronze" as never, false)
        .order("round", { ascending: true });
      const bm = (bmRaw ?? []) as unknown as Array<{
        id: string;
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
      }>;

      const lbl = (id: string | null) => (id ? nameByReg.get(id) ?? "—" : "TBD");

      for (const m of bm ?? []) {
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
          courtId: m.court_id ?? undefined,
          courtLabel: m.courts?.code ?? m.courts?.name ?? undefined,
          scheduledAt: m.scheduled_at ?? null,
        });
        const ws = m.winner_side ?? null;
        tallyTeam(teamStats, m.side_a_registration_id, labelA, sets, "a", ws);
        tallyTeam(teamStats, m.side_b_registration_id, labelB, sets, "b", ws);
      }

      // Estructura del cuadro por ronda (ascendente → Final al final)
      const byRound = new Map<number, typeof bm>();
      for (const m of bm ?? []) {
        if (!byRound.has(m.round)) byRound.set(m.round, []);
        byRound.get(m.round)!.push(m);
      }
      const sortedRounds = Array.from(byRound.keys()).sort((x, y) => x - y);
      for (const r of sortedRounds) {
        const ms = byRound.get(r)!.slice().sort((x, y) => (x.position ?? 0) - (y.position ?? 0));
        bracketRounds.push({
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

      // Camino al título: pasos por registration (de los finalistas)
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

    const standouts = Array.from(teamStats.values())
      .filter((s) => s.setsWon > 0)
      .sort((a, b) => b.setsWon - a.setsWon || b.matchesWon - a.matchesWon)
      .slice(0, 5);
    const phase: "groups" | "knockout" = bracketRounds.length > 0 ? "knockout" : "groups";

    // Lista de equipos inscritos aceptados para la escena "teams" del TV.
    const teams: TournamentLiveTeam[] = (acceptedRegsRaw ?? []).map((r) => ({
      registrationId: r.id as string,
      label: nameByReg.get(r.id as string) ?? "—",
    }));

    // Tabla global: fusión de todos los grupos, re-rankeada por wins → sets diff → games diff.
    const globalStandings: TournamentLiveGlobalStanding[] = allGroupStandingRows
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        const aSetsDiff = a.setsWon - a.setsLost;
        const bSetsDiff = b.setsWon - b.setsLost;
        if (bSetsDiff !== aSetsDiff) return bSetsDiff - aSetsDiff;
        return b.played - a.played;
      })
      .map((row, idx) => ({
        rank: idx + 1,
        label: nameByReg.get(row.registrationId) ?? "—",
        wins: row.wins,
        losses: row.losses,
        played: row.played,
        setsWon: row.setsWon,
        setsLost: row.setsLost,
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
      groupTables: groupTables.slice(0, 8),
      bracketRounds,
      finalists,
      standouts,
      paths,
      championLabel,
      teams,
      globalStandings,
      sponsors,
    };
  });
}
