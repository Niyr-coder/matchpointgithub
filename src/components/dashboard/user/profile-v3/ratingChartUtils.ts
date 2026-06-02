import type { RatingSnapshotPoint } from "../profile-types";

export const STARTING_RATING = 2500;

export const RATING_RANGES = ["3M", "6M", "1A"] as const;
export type RatingRange = (typeof RATING_RANGES)[number];

export const RATING_RANGE_META: Record<RatingRange, { days: number; chartLabel: string }> = {
  "3M": { days: 90, chartLabel: "3M" },
  "6M": { days: 180, chartLabel: "6M" },
  "1A": { days: 365, chartLabel: "12M" },
};

const MONTHS_CHART = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export function ratingDisplay(r: number): string {
  return (r / 1000).toFixed(2);
}

export function filterSnapshotsByRange(snapshots: RatingSnapshotPoint[], days: number): RatingSnapshotPoint[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return snapshots.filter((s) => +new Date(s.snapshotAt) >= cutoff);
}

/**
 * Puntos del gráfico para un rango (3M / 6M / 1A).
 * Usa snapshots dentro del periodo; si faltan, ancla al último rating antes del corte
 * para que cada rango dibuje una curva distinta.
 */
export function buildRatingChartPoints(
  allSnapshots: RatingSnapshotPoint[],
  currentRating: number,
  periodDays: number,
): RatingSnapshotPoint[] {
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const sorted = [...allSnapshots].sort((a, b) => +new Date(a.snapshotAt) - +new Date(b.snapshotAt));
  const inRange = sorted.filter((s) => +new Date(s.snapshotAt) >= cutoff);
  const nowIso = new Date().toISOString();
  const end: RatingSnapshotPoint = { rating: currentRating, snapshotAt: nowIso };

  if (inRange.length >= 2) {
    const last = inRange[inRange.length - 1]!;
    if (last.rating !== currentRating || +new Date(last.snapshotAt) < Date.now() - 60_000) {
      return [...inRange, end];
    }
    return inRange;
  }

  const beforeWindow = sorted.filter((s) => +new Date(s.snapshotAt) < cutoff);
  const anchor = beforeWindow.length > 0 ? beforeWindow[beforeWindow.length - 1]! : sorted[0];
  const start: RatingSnapshotPoint = {
    rating: anchor?.rating ?? STARTING_RATING,
    snapshotAt: new Date(cutoff).toISOString(),
  };

  if (inRange.length === 1) {
    const mid = inRange[0]!;
    return [start, mid, end];
  }

  return [start, end];
}

/** @deprecated Usar buildRatingChartPoints con el listado completo de snapshots. */
export function ensureRatingChartHistory(
  history: RatingSnapshotPoint[],
  currentRating: number,
  periodDays: number,
): RatingSnapshotPoint[] {
  return buildRatingChartPoints(history, currentRating, periodDays);
}

export function chartAxisLabels(points: RatingSnapshotPoint[], maxLabels = 12): string[] {
  const sorted = [...points].sort((a, b) => +new Date(a.snapshotAt) - +new Date(b.snapshotAt));
  if (sorted.length === 0) return [];
  if (sorted.length <= maxLabels) {
    return sorted.map((p) => MONTHS_CHART[new Date(p.snapshotAt).getMonth()]);
  }
  return Array.from({ length: maxLabels }, (_, i) => {
    const idx = Math.round((i / (maxLabels - 1)) * (sorted.length - 1));
    return MONTHS_CHART[new Date(sorted[idx].snapshotAt).getMonth()];
  });
}
