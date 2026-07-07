// Modo Torneo: fase de grupos (round robin) → semifinales → final + bronce,
// como un torneo real pero sobre el modelo player-céntrico de quedadas
// (quedada_rounds + quedada_games; sin tablas de bracket).
//
// Todo se DERIVA de los games ya creados/jugados (append-only):
// - Equipos = cupos de quedada_pairs ordenados por slot_no (el orden de cupos
//   es el seeding). Dobles = pareja fija; singles = 1 jugador por cupo.
// - Grupos deterministas: 1 grupo si hay <6 equipos, 2 grupos (por seed
//   alternado) si hay ≥6. Cambiar el roster ANTES de generar rondas re-arma
//   los grupos; con games creados el organizador debe borrar rondas primero.
// - Rondas 1..K = fechas del round robin por grupo (método del círculo).
// - Ronda K+1 = semifinales (A1-B2 / B1-A2 con 2 grupos; 1°-4° / 2°-3° con 1
//   grupo de ≥4). Con exactamente 3 equipos no hay semis: 1° vs 2° a la final.
// - Última ronda = final + bronce (perdedores de semis).
// El podio (1°/2°/3°) sale de final y bronce vía el hook `podium`.
import { quedadaFormatLabel } from "../format-labels";
import type { EngineContext, EnginePriorGame, QuedadaEngine, RoundPlan } from "../types";
import { fixedTeamsFromPairs, nextRoundNo, pairKey } from "./shared";

type Team = string[];

type Structure = {
  teams: Team[];
  groups: Team[][];
  /** Fechas del round robin por grupo, alineadas: ronda r = fila r de cada grupo. */
  groupRounds: Array<Array<[Team, Team]>>;
  totalGroupRounds: number;
  hasSemis: boolean;
  semiRoundNo: number | null;
  finalRoundNo: number;
};

/** Fechas de round robin con el método del círculo (bye implícito si es impar). */
function roundRobinRounds(teams: Team[]): Array<Array<[Team, Team]>> {
  if (teams.length < 2) return [];
  const list: Array<Team | null> = [...teams];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: Array<Array<[Team, Team]>> = [];
  const rot: Array<Team | null> = [...list];
  for (let r = 0; r < n - 1; r++) {
    const games: Array<[Team, Team]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = rot[i];
      const b = rot[n - 1 - i];
      if (a && b) games.push([a, b]);
    }
    rounds.push(games);
    // Rotación: fijo el primero, el resto gira.
    rot.splice(1, 0, rot.pop() as Team | null);
  }
  return rounds;
}

/** Estructura completa del torneo derivada del roster actual. */
function buildStructure(ctx: EngineContext): Structure | null {
  const teams = fixedTeamsFromPairs(ctx.pairs, ctx.mode);
  if (teams.length < 3) return null;

  const groups: Team[][] = [];
  if (teams.length >= 6) {
    const a: Team[] = [];
    const b: Team[] = [];
    teams.forEach((t, i) => (i % 2 === 0 ? a : b).push(t));
    groups.push(a, b);
  } else {
    groups.push([...teams]);
  }

  const perGroup = groups.map(roundRobinRounds);
  const totalGroupRounds = Math.max(...perGroup.map((r) => r.length));
  const groupRounds: Array<Array<[Team, Team]>> = [];
  for (let r = 0; r < totalGroupRounds; r++) {
    groupRounds.push(perGroup.flatMap((rounds) => rounds[r] ?? []));
  }

  const hasSemis = teams.length >= 4;
  const semiRoundNo = hasSemis ? totalGroupRounds + 1 : null;
  const finalRoundNo = totalGroupRounds + (hasSemis ? 2 : 1);
  return { teams, groups, groupRounds, totalGroupRounds, hasSemis, semiRoundNo, finalRoundNo };
}

type TeamStanding = { team: Team; wins: number; pf: number; pc: number; diff: number };

function sideOf(g: EnginePriorGame, side: "a" | "b"): Team {
  return (side === "a" ? [g.side_a_p1, g.side_a_p2] : [g.side_b_p1, g.side_b_p2]).filter(
    (x): x is string => !!x,
  );
}

/** Tabla de un conjunto de equipos a partir de los games jugados entre ellos. */
function teamStandings(teams: Team[], prior: EnginePriorGame[], maxRoundNo: number): TeamStanding[] {
  const byKey = new Map<string, TeamStanding>(
    teams.map((t) => [pairKey(t), { team: t, wins: 0, pf: 0, pc: 0, diff: 0 }]),
  );
  for (const g of prior) {
    if ((g.round_no ?? 0) > maxRoundNo || g.status !== "played") continue;
    const a = byKey.get(pairKey(sideOf(g, "a")));
    const b = byKey.get(pairKey(sideOf(g, "b")));
    if (!a || !b) continue;
    const pa = g.points_a ?? 0;
    const pb = g.points_b ?? 0;
    a.pf += pa; a.pc += pb;
    b.pf += pb; b.pc += pa;
    if (pa > pb) a.wins++;
    if (pb > pa) b.wins++;
  }
  const rows = [...byKey.values()];
  rows.forEach((r) => (r.diff = r.pf - r.pc));
  // Empates: victorias → diferencia → puntos a favor → seed (orden de cupo).
  const seed = new Map(teams.map((t, i) => [pairKey(t), i]));
  rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.diff - a.diff ||
      b.pf - a.pf ||
      (seed.get(pairKey(a.team)) ?? 99) - (seed.get(pairKey(b.team)) ?? 99),
  );
  return rows;
}

/** Todos los games de grupos generados y jugados (sin marcadores pendientes). */
function groupStageDone(s: Structure, prior: EnginePriorGame[]): boolean {
  const created = prior.filter((g) => (g.round_no ?? 0) <= s.totalGroupRounds);
  const expected = s.groupRounds.reduce((sum, r) => sum + r.length, 0);
  if (created.length < expected) return false;
  return created.every((g) => g.status === "played");
}

/** Cruces de semifinales según la tabla de grupos. */
function semiPairings(s: Structure, prior: EnginePriorGame[]): Array<[Team, Team]> | null {
  if (s.groups.length === 2) {
    const [ga, gb] = s.groups.map((g) => teamStandings(g, prior, s.totalGroupRounds));
    if (ga.length < 2 || gb.length < 2) return null;
    return [
      [ga[0].team, gb[1].team],
      [gb[0].team, ga[1].team],
    ];
  }
  const table = teamStandings(s.groups[0], prior, s.totalGroupRounds);
  if (table.length < 4) return null;
  return [
    [table[0].team, table[3].team],
    [table[1].team, table[2].team],
  ];
}

/** Ganador/perdedor de un game jugado; null si está pendiente o empatado. */
function decideGame(g: EnginePriorGame): { winner: Team; loser: Team } | null {
  if (g.status !== "played") return null;
  const pa = g.points_a ?? 0;
  const pb = g.points_b ?? 0;
  if (pa === pb) return null; // empate: corregir el marcador antes de avanzar
  const a = sideOf(g, "a");
  const b = sideOf(g, "b");
  return pa > pb ? { winner: a, loser: b } : { winner: b, loser: a };
}

function assignCourts(games: Array<[Team, Team]>, courts: number): RoundPlan["games"] {
  return games.map(([a, b], i) => ({
    courtNo: courts > 0 ? (i % courts) + 1 : i + 1,
    sideA: a,
    sideB: b,
  }));
}

function byesFor(s: Structure, playing: Array<[Team, Team]>): string[] {
  const busy = new Set(playing.flatMap(([a, b]) => [pairKey(a), pairKey(b)]));
  return s.teams.filter((t) => !busy.has(pairKey(t))).flat();
}

export const torneoEngine: QuedadaEngine = {
  format: "torneo",
  label: quedadaFormatLabel("torneo"),
  rosterMode: (mode) => (mode === "singles" ? "individual" : "fixed_pairs"),
  standingsMode: (mode) => (mode === "singles" ? "individual" : "pair"),
  canGenerateRound: true,
  canManualGame: false,
  roundLabel: "Ronda",
  tableEntityLabel: "Equipo",
  planNextRound: (ctx): RoundPlan | null => {
    const s = buildStructure(ctx);
    if (!s) return null;
    const roundNo = nextRoundNo(ctx.prior);

    // Fase de grupos: la fecha r del round robin de cada grupo.
    if (roundNo <= s.totalGroupRounds) {
      const games = s.groupRounds[roundNo - 1] ?? [];
      if (games.length === 0) return null;
      return { roundNo, games: assignCourts(games, ctx.courts), byes: byesFor(s, games) };
    }

    // Semifinales: recién cuando TODA la fase de grupos está jugada.
    if (s.hasSemis && roundNo === s.semiRoundNo) {
      if (!groupStageDone(s, ctx.prior)) return null;
      const semis = semiPairings(s, ctx.prior);
      if (!semis) return null;
      return { roundNo, games: assignCourts(semis, ctx.courts), byes: byesFor(s, semis) };
    }

    // Final (+ bronce si hubo semis).
    if (roundNo === s.finalRoundNo) {
      if (!s.hasSemis) {
        // 3 equipos: 1° vs 2° directo a la final.
        if (!groupStageDone(s, ctx.prior)) return null;
        const table = teamStandings(s.groups[0], ctx.prior, s.totalGroupRounds);
        if (table.length < 2) return null;
        const finalGame: Array<[Team, Team]> = [[table[0].team, table[1].team]];
        return { roundNo, games: assignCourts(finalGame, ctx.courts), byes: byesFor(s, finalGame) };
      }
      const semiGames = ctx.prior.filter((g) => (g.round_no ?? 0) === s.semiRoundNo);
      if (semiGames.length < 2) return null;
      const decided = semiGames.map(decideGame);
      if (decided.some((d) => !d)) return null; // semis pendientes o empatadas
      const [d1, d2] = decided as Array<{ winner: Team; loser: Team }>;
      const games: Array<[Team, Team]> = [
        [d1.winner, d2.winner], // final
        [d1.loser, d2.loser], // bronce
      ];
      return { roundNo, games: assignCourts(games, ctx.courts), byes: [] };
    }

    return null; // torneo completo
  },
  roundNameFor: (ctx, roundNo) => {
    const s = buildStructure(ctx);
    if (!s) return null;
    if (roundNo <= s.totalGroupRounds) {
      const groupLabel = s.groups.length > 1 ? "Fase de grupos" : "Todos contra todos";
      return s.totalGroupRounds > 1 ? `${groupLabel} · Fecha ${roundNo}` : groupLabel;
    }
    if (s.hasSemis && roundNo === s.semiRoundNo) return "Semifinales";
    if (roundNo === s.finalRoundNo) return s.hasSemis ? "Final y bronce" : "Final";
    return null;
  },
  podium: (ctx): string[][] | null => {
    const s = buildStructure(ctx);
    if (!s) return null;
    const finalGames = ctx.prior.filter((g) => (g.round_no ?? 0) === s.finalRoundNo);
    if (finalGames.length === 0) return null;

    if (!s.hasSemis) {
      const d = decideGame(finalGames[0]);
      if (!d) return null;
      const table = teamStandings(s.groups[0], ctx.prior, s.totalGroupRounds);
      const third = table.find(
        (r) => pairKey(r.team) !== pairKey(d.winner) && pairKey(r.team) !== pairKey(d.loser),
      );
      return [d.winner, d.loser, ...(third ? [third.team] : [])];
    }

    // Con semis: identificar final vs bronce por los ganadores de semis.
    const semiGames = ctx.prior.filter((g) => (g.round_no ?? 0) === s.semiRoundNo);
    const decidedSemis = semiGames.map(decideGame).filter((d): d is NonNullable<typeof d> => !!d);
    if (decidedSemis.length < 2) return null;
    const winnersKeys = new Set(decidedSemis.map((d) => pairKey(d.winner)));
    const finalGame = finalGames.find(
      (g) => winnersKeys.has(pairKey(sideOf(g, "a"))) && winnersKeys.has(pairKey(sideOf(g, "b"))),
    );
    const bronzeGame = finalGames.find((g) => g !== finalGame);
    const df = finalGame ? decideGame(finalGame) : null;
    if (!df) return null;
    const db = bronzeGame ? decideGame(bronzeGame) : null;
    return [df.winner, df.loser, ...(db ? [db.winner] : [])];
  },
};
