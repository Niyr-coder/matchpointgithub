/** Etiqueta de ronda en eliminación directa (índice 0 = primera ronda del cuadro). */
export function knockoutRoundLabel(roundIndex: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - roundIndex;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semis";
  if (fromEnd === 2) return "Cuartos";
  if (fromEnd === 3) return "Octavos";
  if (fromEnd === 4) return "Dieciseisavos";
  return `Ronda ${roundIndex + 1}`;
}

/** Tamaño del cuadro (potencia de 2) y partidos por ronda para N inscripciones. */
export function knockoutRoundMatchCounts(entryCount: number): number[] {
  const n = Math.max(2, entryCount);
  let size = 2;
  while (size < n) size *= 2;
  const numRounds = Math.log2(size);
  const counts: number[] = [];
  for (let round = 1; round <= numRounds; round++) {
    counts.push(size / Math.pow(2, round));
  }
  return counts;
}
