/** Estados de partido con marcador cargado (grupos o eliminatoria). */
export function isScoredMatchStatus(status: string): boolean {
  return status === "reported" || status === "confirmed";
}

export function winnerSideFromSets(setsA: number, setsB: number): "a" | "b" {
  if (setsA === setsB) {
    throw new Error("INVALID_SCORE_TIE");
  }
  return setsA > setsB ? "a" : "b";
}

/** Siguiente celda del cuadro al avanzar un ganador. */
export function nextBracketFeederSlot(round: number, position: number): {
  nextRound: number;
  nextPos: number;
  feederSide: "a" | "b";
} {
  return {
    nextRound: round + 1,
    nextPos: Math.floor(position / 2),
    feederSide: position % 2 === 0 ? "a" : "b",
  };
}
