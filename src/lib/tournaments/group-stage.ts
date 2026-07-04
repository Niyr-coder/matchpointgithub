/**
 * Motor puro: fase de grupos + seeding internacional para groups_to_knockout.
 * Sin I/O — testeable y reutilizable desde server actions.
 */

import type { ScoringConfig } from "@/lib/schemas/tournaments";

export type GroupSchedulingConfig = {
  /** Canchas del club seleccionadas para esta categoría. */
  courtIds: string[];
  /** Duración estimada por partido (minutos). */
  slotDurationMin: number;
  /** Inicio de la fecha 1 (ISO). Las fechas siguientes avanzan con fechaGapHours. */
  roundOneStartsAt?: string | null;
  /** Horas entre fechas (round_no). Default 24. */
  fechaGapHours?: number;
};

export type GroupWildcardConfig = {
  mode: "best_thirds_global";
  count: number;
};

export type KnockoutExtrasConfig = {
  thirdPlaceMatch: boolean;
};

export type GroupPlayoffConfig = {
  groupsCount: number;
  advancePerGroup: number;
  /**
   * Cómo se arman los grupos. `auto` (default) = sorteo aleatorio equitativo.
   * `manual` = el organizador asigna las parejas a mano (Opción A).
   * Ausente/null se trata como `auto` para no alterar torneos existentes.
   */
  drawMode?: "auto" | "manual" | null;
  finalScoringOverride?: ScoringConfig | null;
  scheduling?: GroupSchedulingConfig | null;
  wildcards?: GroupWildcardConfig | null;
  knockoutExtras?: KnockoutExtrasConfig | null;
};

/** Asignación manual de inscripciones a un grupo (por índice 0-based = A, B, C…). */
export type ManualGroupAssignment = {
  groupIndex: number;
  registrationIds: string[];
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
  /** Mejor N.º del grupo fuera del corte directo (wildcard). */
  isWildcard?: boolean;
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

/**
 * Valida una asignación manual de grupos (Opción A) antes de persistir.
 * Reglas: exactamente `groupsCount` grupos con índices únicos en rango; cada
 * grupo con ≥2 parejas; cada inscripción aceptada asignada exactamente una vez.
 * Devuelve el mensaje de error, o `null` si la asignación es válida.
 */
export function validateManualGroupAssignment(
  assignments: ManualGroupAssignment[],
  acceptedIds: string[],
  groupsCount: number,
): string | null {
  if (assignments.length !== groupsCount) {
    return `Debes definir exactamente ${groupsCount} grupo(s)`;
  }
  const seenIdx = new Set<number>();
  for (const a of assignments) {
    if (a.groupIndex < 0 || a.groupIndex >= groupsCount) {
      return "Un índice de grupo está fuera de rango";
    }
    if (seenIdx.has(a.groupIndex)) return "Hay un grupo repetido";
    seenIdx.add(a.groupIndex);
  }
  const accepted = new Set(acceptedIds);
  const assigned = new Set<string>();
  for (const a of assignments) {
    if (a.registrationIds.length < 2) {
      return "Cada grupo necesita al menos 2 parejas";
    }
    for (const rid of a.registrationIds) {
      if (!accepted.has(rid)) {
        return "Una inscripción no está aceptada en esta categoría";
      }
      if (assigned.has(rid)) return "Una inscripción quedó en más de un grupo";
      assigned.add(rid);
    }
  }
  if (assigned.size !== accepted.size) {
    return `Faltan ${accepted.size - assigned.size} pareja(s) por asignar a un grupo`;
  }
  return null;
}

/**
 * Partidos a crear cuando entra una pareja tarde a un grupo (Opción B): uno
 * contra cada miembro existente, cada uno en una fecha nueva (para no
 * duplicar al recién llegado en una misma fecha). Los partidos ya jugados de
 * los demás no se tocan. El total resultante coincide con el RR completo de
 * N+1 equipos, así que las tablas quedan consistentes.
 */
export function buildLateEntryMatchRows(
  newRegistrationId: string,
  existingMemberIds: string[],
  maxRoundNo: number,
): Array<{ roundNo: number; matchNo: number; sideA: string; sideB: string }> {
  return existingMemberIds.map((memberId, i) => ({
    roundNo: maxRoundNo + 1 + i,
    matchNo: 1,
    sideA: newRegistrationId,
    sideB: memberId,
  }));
}

/**
 * Valida un orden de siembra manual del cuadro (Opción C): debe ser
 * exactamente una permutación de las inscripciones aceptadas — mismos ids, sin
 * faltantes, sin duplicados ni extras. El seed 1 es el primero de la lista.
 * Devuelve el mensaje de error, o `null` si es válido.
 */
export function validateManualSeeds(
  manualSeeds: string[],
  acceptedIds: string[],
): string | null {
  if (manualSeeds.length !== acceptedIds.length) {
    return `Las semillas deben incluir exactamente a las ${acceptedIds.length} inscripciones aceptadas`;
  }
  const accepted = new Set(acceptedIds);
  const seen = new Set<string>();
  for (const id of manualSeeds) {
    if (!accepted.has(id)) return "Una semilla no corresponde a una inscripción aceptada";
    if (seen.has(id)) return "Una inscripción está repetida en las semillas";
    seen.add(id);
  }
  return null;
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
    if (m.status !== "confirmed") continue;
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

/** Cuántos mejores terceros globales entran como wildcards. */
export function wildcardCount(config: GroupPlayoffConfig): number {
  if (config.wildcards?.mode === "best_thirds_global") {
    return config.wildcards.count ?? 0;
  }
  return 0;
}

/** Mejores N terceros entre todos los grupos (estilo fútbol). */
export function pickBestThirdsGlobal(
  groups: Array<{
    id: string;
    name: string;
    sortOrder: number;
    memberIds: string[];
    matches: GroupMatchResult[];
  }>,
  advancePerGroup: number,
  count: number,
): QualifiedEntry[] {
  if (count <= 0) return [];
  const thirds: QualifiedEntry[] = [];
  for (const g of groups) {
    const standings = computeGroupStandings(g.memberIds, g.matches);
    const row = standings.find((s) => s.rank === advancePerGroup + 1);
    if (!row) continue;
    thirds.push({
      registrationId: row.registrationId,
      groupId: g.id,
      groupName: g.name,
      groupSortOrder: g.sortOrder,
      rankInGroup: row.rank,
      wins: row.wins,
      setsDiff: row.setsWon - row.setsLost,
      gamesDiff: row.gamesWon - row.gamesLost,
      isWildcard: true,
    });
  }
  return rankQualifiersGlobally(thirds).slice(0, count);
}

/** Clasificados directos + wildcards (mejores terceros). */
export function pickAllQualifiers(
  groups: Array<{
    id: string;
    name: string;
    sortOrder: number;
    memberIds: string[];
    matches: GroupMatchResult[];
  }>,
  config: GroupPlayoffConfig,
): QualifiedEntry[] {
  const primary = pickQualifiers(groups, config.advancePerGroup);
  const wc = wildcardCount(config);
  if (wc <= 0) return primary;
  const wildcards = pickBestThirdsGlobal(groups, config.advancePerGroup, wc);
  return [...primary, ...wildcards];
}

/** Preview legible para la UI de config. */
export function previewGroupPlayoff(config: GroupPlayoffConfig, acceptedCount: number) {
  const minGroupSize = acceptedCount > 0 ? Math.floor(acceptedCount / config.groupsCount) : 0;
  const maxGroupSize = acceptedCount > 0 ? Math.ceil(acceptedCount / config.groupsCount) : 0;
  const wc = wildcardCount(config);
  const qualified = config.groupsCount * config.advancePerGroup + wc;
  const bracketSize = qualified >= 2 ? nextPowerOfTwo(qualified) : 0;
  return {
    minGroupSize,
    maxGroupSize,
    qualified,
    bracketSize,
    byes: bracketSize > 0 ? bracketSize - qualified : 0,
    wildcardCount: wc,
  };
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
  const wc = wildcardCount(config);
  if (wc > config.groupsCount) {
    return `No puedes tener más mejores 3.º (${wc}) que grupos (${config.groupsCount})`;
  }
  if (wc > 0) {
    if (config.advancePerGroup < 2) {
      return "Mejores terceros globales requiere clasificar al menos 2 por grupo";
    }
  }
  const total = config.groupsCount * config.advancePerGroup + wc;
  if (total < 2) return "Se necesitan al menos 2 clasificados para la llave";
  return null;
}
