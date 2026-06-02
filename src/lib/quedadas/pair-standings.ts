import type { GameForStandings, StandingRow } from "./standings";

export type PairStandingRow = StandingRow & {
  pairId: string;
  playerIds: string[];
};

const sideKey = (ids: string[]): string => ids.slice().sort().join("|");

export function pairStandings(
  games: GameForStandings[],
  pairs: Array<{ id: string; player_a_id: string; player_b_id: string | null }>,
): PairStandingRow[] {
  const rows = new Map<string, PairStandingRow>();
  const ensure = (ids: string[]): PairStandingRow => {
    const key = sideKey(ids);
    let row = rows.get(key);
    if (!row) {
      row = { userId: key, pairId: key, playerIds: ids, played: 0, wins: 0, pf: 0, pc: 0, diff: 0 };
      rows.set(key, row);
    }
    return row;
  };

  for (const p of pairs) ensure([p.player_a_id, p.player_b_id].filter((x): x is string => !!x));

  for (const g of games) {
    if (g.status !== "played") continue;
    const a = [g.side_a_p1, g.side_a_p2].filter((x): x is string => !!x);
    const b = [g.side_b_p1, g.side_b_p2].filter((x): x is string => !!x);
    const ra = ensure(a);
    const rb = ensure(b);
    const pa = g.points_a ?? 0;
    const pb = g.points_b ?? 0;
    ra.played++;
    rb.played++;
    ra.pf += pa;
    ra.pc += pb;
    rb.pf += pb;
    rb.pc += pa;
    if (pa > pb) ra.wins++;
    if (pb > pa) rb.wins++;
  }

  const out = [...rows.values()];
  out.forEach((r) => (r.diff = r.pf - r.pc));
  out.sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.pf - a.pf || a.pairId.localeCompare(b.pairId));
  return out;
}
