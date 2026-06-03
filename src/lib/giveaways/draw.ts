// Sorteo ponderado — Fisher-Yates sobre pool expandido por entradas.

export function buildWeightedPool(entries: { userId: string; totalEntries: number }[]): string[] {
  const pool: string[] = [];
  for (const e of entries) {
    const n = Math.max(1, Math.min(50, e.totalEntries));
    for (let i = 0; i < n; i += 1) {
      pool.push(e.userId);
    }
  }
  return pool;
}

export function pickWeightedWinners(pool: string[], maxWinners: number): string[] {
  if (pool.length === 0) return [];
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const winners: string[] = [];
  const seen = new Set<string>();
  for (const uid of shuffled) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    winners.push(uid);
    if (winners.length >= maxWinners) break;
  }
  return winners;
}

export function entryProbability(totalEntries: number, poolSize: number): number {
  if (poolSize <= 0 || totalEntries <= 0) return 0;
  return (totalEntries / poolSize) * 100;
}
