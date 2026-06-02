import type { DraftGame, EnginePair, EnginePriorGame, QuedadaMatchMode } from "../types";

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function playersFromPairs(pairs: EnginePair[]): string[] {
  return Array.from(
    new Set(pairs.flatMap((p) => [p.player_a_id, p.player_b_id]).filter((x): x is string => !!x)),
  );
}

export function fixedTeamsFromPairs(pairs: EnginePair[], mode: QuedadaMatchMode): string[][] {
  return pairs
    .slice()
    .sort((a, b) => a.slot_no - b.slot_no)
    .map((p) => (mode === "singles" ? [p.player_a_id] : [p.player_a_id, p.player_b_id].filter((x): x is string => !!x)))
    .filter((team) => team.length === (mode === "singles" ? 1 : 2));
}

export function nextRoundNo(prior: EnginePriorGame[]): number {
  return prior.reduce((m, g) => Math.max(m, g.round_no ?? 0), 0) + 1;
}

export function pairKey(ids: string[]): string {
  return ids.slice().sort().join("|");
}

export function matchupKey(a: string[], b: string[]): string {
  return [pairKey(a), pairKey(b)].sort().join("::");
}

export function draftFromTeams(teams: string[][], courts: number): DraftGame[] {
  const games: DraftGame[] = [];
  for (let i = 0; i + 1 < teams.length; i += 2) {
    games.push({
      courtNo: courts > 0 ? (games.length % courts) + 1 : games.length + 1,
      sideA: teams[i],
      sideB: teams[i + 1],
    });
  }
  return games;
}
