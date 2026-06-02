export type MatchPlannedMeta = {
  bestOf?: 1 | 3 | 5;
  reservationId?: string;
};

export function readMatchPlannedMeta(score: unknown): MatchPlannedMeta {
  if (!score || typeof score !== "object") return {};
  const planned = (score as { planned?: unknown }).planned;
  if (!planned || typeof planned !== "object") return {};
  const p = planned as Record<string, unknown>;
  const meta: MatchPlannedMeta = {};
  if (p.bestOf === 1 || p.bestOf === 3 || p.bestOf === 5) meta.bestOf = p.bestOf;
  if (typeof p.reservationId === "string" && p.reservationId) meta.reservationId = p.reservationId;
  return meta;
}
