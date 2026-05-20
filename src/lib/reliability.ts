// Score de fiabilidad del jugador (no-show / cancelaciones).
// Client-safe. Ver docs/product/04-matches-lifecycle.md.

export type ReliabilityCounters = { noShows: number; cancellations: number };

// 100 = perfecto. Cada inasistencia pega fuerte; cada cancelación, leve.
export function reliabilityScore({ noShows, cancellations }: ReliabilityCounters): number {
  return Math.max(0, Math.min(100, 100 - noShows * 15 - cancellations * 3));
}

export function reliabilityTier(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Excelente", color: "#10b981" };
  if (score >= 70) return { label: "Buena", color: "#0ea5e9" };
  if (score >= 40) return { label: "Regular", color: "#f59e0b" };
  return { label: "Baja", color: "#dc2626" };
}
