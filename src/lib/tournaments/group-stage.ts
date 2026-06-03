/**
 * Motor puro: fase de grupos + seeding internacional para groups_to_knockout.
 * Sin I/O — testeable y reutilizable desde server actions.
 */

export type GroupPlayoffConfig = {
  groupsCount: number;
  advancePerGroup: number;
  finalScoringOverride?: {
    type: "side_out" | "rally";
    points: number;
    winBy: number;
    bestOf: number;
  } | null;
};

export type MatchScore = {
  sets?: Array<{ a: number; b: number }>;
};

export type GroupMatchResult = {
  sideARegistrationId: string;
  sideBRegistrationId: string;
  winnerSide: "a" | "b" | "d" | null;
  score: MatchScore | null;
  status: string;
};

export type GroupStandingRow = {
  registrationId: string;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  rank: number;
};

export type QualifiedEntry = {
  registrationId: string;
  groupId: string;
  groupName: string;
  groupSortOrder: number;
  rankInGroup: number;
  wins: number;
  setsDiff: number;
  gamesDiff: number;
};

const GROUP_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Fisher–Yates in-place shuffle (returns new array). */
export function shuffleIds<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Reparte IDs en G grupos lo más equitativo posible. */
export function distributeToGroups(registrationIds: string[], groupsCount: number): string[][] {
  if (groupsCount < 1) throw new Error("groupsCount debe ser >= 1");
  if (registrationIds.length < groupsCount) {
    throw new Error("No hay suficientes inscripciones para el número de grupos");
  }
  const shuffled = shuffleIds(registrationIds);
  const groups: string[][] = Array.from({ length: groupsCount }, () => []);
  shuffled.forEach((id, i) => {
    groups[i % groupsCount].push(id);
  });
  return groups;
}

/** Round-robin clásico (método del círculo). Devuelve fechas de emparejamientos. */
export function buildRoundRobinRounds(memberIds: string[]): Array<Array<[string, string]>> {
  const teams = [...memberIds];
  const bye = "__BYE__";
  if (teams.length % 2 === 1) teams.push(bye);
  const n = teams.length;
  const rounds: Array<Array<[string, string]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i];
      const b = teams[n - 1 - i];
      if (a !== bye && b !== bye) pairs.push([a, b]);
    }
    rounds.push(pairs);
    const fixed = teams[0];
    const rest = teams.slice(1);
    const last = rest.pop()!;
    rest.unshift(last);
    teams.splice(0, teams.length, fixed, ...rest);
  }
  return rounds;
}

function parseSets(score: MatchScore | null): Array<{ a: number; b: number }> {
  if (!score?.sets?.length) return [];
  return score.sets.map((s) => ({ a: Number(s.a) || 0, b: Number(s.b) || 0 }));
}

/** Tabla de un grupo a partir de partidos jugados. */
export function computeGroupStandings(
  memberIds: string[],
  matches: GroupMatchResult[],
): GroupStandingRow[] {
  const stats = new Map<
    string,
    Omit<GroupStandingRow, "rank"> & { headToHeadWins: Map<string, number> }
  >();

  for (const id of memberIds) {
    stats.set(id, {
      registrationId: id,
      played: 0,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 0,
      gamesLost: 0,
      headToHeadWins: new Map(),
    });
  }

  for (const m of matches) {
    if (m.status !== "reported" && m.status !== "confirmed" && m.status !== "live") continue;
    if (!m.winnerSide || m.winnerSide === "d") continue;
    const a = stats.get(m.sideARegistrationId);
    const b = stats.get(m.sideBRegistrationId);
    if (!a || !b) continue;

    a.played++;
    b.played++;
    const sets = parseSets(m.score);
    for (const s of sets) {
      a.setsWon += s.a;
      a.setsLost += s.b;
      b.setsWon += s.b;
      b.setsLost += s.a;
      a.gamesWon += s.a;
      a.gamesLost += s.b;
      b.gamesWon += s.b;
      b.gamesLost += s.a;
    }

    if (m.winnerSide === "a") {
      a.wins++;
      b.losses++;
      a.headToHeadWins.set(b.registrationId, (a.headToHeadWins.get(b.registrationId) ?? 0) + 1);
    } else {
      b.wins++;
      a.losses++;
      b.headToHeadWins.set(a.registrationId, (b.headToHeadWins.get(a.registrationId) ?? 0) + 1);
    }
  }

  const rows = [...stats.values()].sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    const xSd = x.setsWon - x.setsLost;
    const ySd = y.setsWon - y.setsLost;
    if (ySd !== xSd) return ySd - xSd;
    const xGd = x.gamesWon - x.gamesLost;
    const yGd = y.gamesWon - y.gamesLost;
    if (yGd !== xGd) return yGd - xGd;
    const h2h = (y.headToHeadWins.get(x.registrationId) ?? 0) - (x.headToHeadWins.get(y.registrationId) ?? 0);
    if (h2h !== 0) return h2h;
    return x.registrationId.localeCompare(y.registrationId);
  });

  return rows.map((r, i) => {
    const { headToHeadWins: _, ...rest } = r;
    return { ...rest, rank: i + 1 };
  });
}

export function groupLabel(index: number): string {
  if (index < GROUP_NAMES.length) return GROUP_NAMES[index];
  return `G${index + 1}`;
}

/** Clasificados top N por grupo. */
export function pickQualifiers(
  groups: Array<{
    id: string;
    name: string;
    sortOrder: number;
    memberIds: string[];
    matches: GroupMatchResult[];
  }>,
  advancePerGroup: number,
): QualifiedEntry[] {
  const out: QualifiedEntry[] = [];
  for (const g of groups) {
    const standings = computeGroupStandings(g.memberIds, g.matches);
    const top = standings.slice(0, advancePerGroup);
    for (const row of top) {
      out.push({
        registrationId: row.registrationId,
        groupId: g.id,
        groupName: g.name,
        groupSortOrder: g.sortOrder,
        rankInGroup: row.rank,
        wins: row.wins,
        setsDiff: row.setsWon - row.setsLost,
        gamesDiff: row.gamesWon - row.gamesLost,
      });
    }
  }
  return out;
}

/** Orden global de clasificados para seeds. */
export function rankQualifiersGlobally(entries: QualifiedEntry[]): QualifiedEntry[] {
  return [...entries].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.setsDiff !== a.setsDiff) return b.setsDiff - a.setsDiff;
    if (b.gamesDiff !== a.gamesDiff) return b.gamesDiff - a.gamesDiff;
    if (a.rankInGroup !== b.rankInGroup) return a.rankInGroup - b.rankInGroup;
    if (a.groupSortOrder !== b.groupSortOrder) return a.groupSortOrder - b.groupSortOrder;
    return a.registrationId.localeCompare(b.registrationId);
  });
}

/** Siguiente potencia de 2 >= n. */
export function nextPowerOfTwo(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

/**
 * Plantilla estándar de posiciones en bracket (1-based seeds).
 * size=8 → [[1,8],[4,5],[2,7],[3,6]]
 */
export function standardBracketPairings(size: number): Array<[number, number]> {
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new Error("size debe ser potencia de 2");
  }
  if (size === 2) return [[1, 2]];

  const half = size / 2;
  const top = standardBracketPairings(half);
  const out: Array<[number, number]> = [];
  for (const [a, b] of top) {
    out.push([a, size + 1 - a]);
    out.push([b, size + 1 - b]);
  }
  return out;
}

/**
 * Emparejamientos internacionales cuando pasan 2+ por grupo.
 * Cruza 1º de un grupo con 2º de otro (patrón FIFA simplificado).
 */
export function crossGroupFirstRound(
  entries: QualifiedEntry[],
  groupsCount: number,
  advancePerGroup: number,
): Array<[string | null, string | null]> {
  const byGroup = new Map<number, QualifiedEntry[]>();
  for (const e of entries) {
    const list = byGroup.get(e.groupSortOrder) ?? [];
    list.push(e);
    byGroup.set(e.groupSortOrder, list);
  }
  for (const [, list] of byGroup) {
    list.sort((a, b) => a.rankInGroup - b.rankInGroup);
  }

  const pairs: Array<[string | null, string | null]> = [];
  if (advancePerGroup === 2 && groupsCount >= 2) {
    for (let g = 0; g < groupsCount; g++) {
      const home = byGroup.get(g)?.find((e) => e.rankInGroup === 1);
      const awayGroup = (g + groupsCount / 2) % groupsCount;
      const away = byGroup.get(awayGroup)?.find((e) => e.rankInGroup === 2);
      if (home && away) pairs.push([home.registrationId, away.registrationId]);
    }
    return pairs;
  }

  const ranked = rankQualifiersGlobally(entries);
  const size = nextPowerOfTwo(ranked.length);
  const seeds: Array<string | null> = ranked.map((e) => e.registrationId);
  while (seeds.length < size) seeds.push(null);
  return standardBracketPairings(size).map(([s1, s2]) => [
    seeds[s1 - 1] ?? null,
    seeds[s2 - 1] ?? null,
  ]);
}

export function validateGroupPlayoffConfig(
  config: GroupPlayoffConfig,
  acceptedCount: number,
): string | null {
  if (config.groupsCount < 1) return "Debe haber al menos 1 grupo";
  if (config.advancePerGroup < 1) return "Debe clasificar al menos 1 por grupo";
  if (acceptedCount < config.groupsCount) {
    return `Necesitas al menos ${config.groupsCount} inscripciones aceptadas (tienes ${acceptedCount})`;
  }
  const minGroupSize = Math.floor(acceptedCount / config.groupsCount);
  if (config.advancePerGroup >= minGroupSize) {
    return `advancePerGroup (${config.advancePerGroup}) debe ser menor que el tamaño mínimo del grupo (${minGroupSize})`;
  }
  const total = config.groupsCount * config.advancePerGroup;
  if (total < 2) return "Se necesitan al menos 2 clasificados para la llave";
  return null;
}
