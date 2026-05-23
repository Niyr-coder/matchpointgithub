// Standings INDIVIDUALES del motor de quedadas (formatos de rotación: americano,
// y los que vengan después). Se DERIVAN (append-only) de los games jugados: nunca
// se guarda un estado mutable que haya que recomputar al cambiar el roster.
//
// Ranking del americano (decisión de producto): por PUNTOS A FAVOR acumulados;
// desempate por DIFERENCIA (PF − PC); luego victorias; luego nombre (estable).

export type GameForStandings = {
  side_a_p1: string;
  side_a_p2: string | null;
  side_b_p1: string;
  side_b_p2: string | null;
  points_a: number | null;
  points_b: number | null;
  status: string;
};

export type StandingRow = {
  userId: string;
  played: number; // partidos jugados (no cuenta byes)
  wins: number;
  pf: number; // puntos a favor
  pc: number; // puntos en contra
  diff: number; // pf − pc
};

/**
 * Calcula el ranking individual de una categoría.
 * @param games games de la categoría (se ignoran los no 'played').
 * @param playerIds inscritos a incluir (aunque no hayan jugado → fila en 0).
 * @param nameOf opcional, para desempate estable por nombre.
 */
export function individualStandings(
  games: GameForStandings[],
  playerIds: string[],
  nameOf?: (userId: string) => string,
): StandingRow[] {
  const stat = new Map<string, StandingRow>();
  for (const id of playerIds) stat.set(id, { userId: id, played: 0, wins: 0, pf: 0, pc: 0, diff: 0 });

  const ensure = (id: string): StandingRow => {
    let r = stat.get(id);
    if (!r) {
      r = { userId: id, played: 0, wins: 0, pf: 0, pc: 0, diff: 0 };
      stat.set(id, r);
    }
    return r;
  };

  for (const g of games) {
    if (g.status !== "played") continue;
    const pa = g.points_a ?? 0;
    const pb = g.points_b ?? 0;
    const sideA = [g.side_a_p1, g.side_a_p2].filter((x): x is string => !!x);
    const sideB = [g.side_b_p1, g.side_b_p2].filter((x): x is string => !!x);
    const aWon = pa > pb;
    const bWon = pb > pa;
    for (const id of sideA) {
      const r = ensure(id);
      r.played++;
      r.pf += pa;
      r.pc += pb;
      if (aWon) r.wins++;
    }
    for (const id of sideB) {
      const r = ensure(id);
      r.played++;
      r.pf += pb;
      r.pc += pa;
      if (bWon) r.wins++;
    }
  }

  const rows = [...stat.values()];
  rows.forEach((r) => (r.diff = r.pf - r.pc));
  rows.sort((x, y) => {
    if (y.pf !== x.pf) return y.pf - x.pf; // puntos a favor (primario)
    if (y.diff !== x.diff) return y.diff - x.diff; // diferencia (desempate)
    if (y.wins !== x.wins) return y.wins - x.wins; // victorias
    if (nameOf) return nameOf(x.userId).localeCompare(nameOf(y.userId));
    return x.userId.localeCompare(y.userId);
  });
  return rows;
}
