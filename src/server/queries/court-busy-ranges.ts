import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { parseTstzRange } from "@/lib/reservations/during-range";

export type CourtBusyRange = {
  startsAt: string;
  endsAt: string;
  status: string;
};

// Regla de negocio: una reserva cancelada a MENOS de 30 min de su inicio no
// vuelve al picker del jugador — el slot queda retenido para el club
// (recepción/walk-in lo pueden reasignar). Cancelada con ≥30 min de
// anticipación, el slot reabre normal.
export const LATE_CANCEL_HOLD_MS = 30 * 60 * 1000;

export function isLateCancelHold(start: Date, cancelledAt: Date | null): boolean {
  if (!cancelledAt) return false;
  return start.getTime() - cancelledAt.getTime() < LATE_CANCEL_HOLD_MS;
}

/** Tramos ocupados de una cancha (sin PII). Service-role para ver todas las reservas. */
export async function loadCourtBusyRanges(
  clubId: string,
  courtId: string,
  from: Date,
  to: Date,
): Promise<{ ranges: CourtBusyRange[]; error?: string }> {
  const range = `[${from.toISOString()},${to.toISOString()})`;
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("reservations")
    .select("during, status, cancelled_at")
    .eq("club_id", clubId)
    .eq("court_id", courtId)
    .overlaps("during", range);

  if (error) {
    console.error("[loadCourtBusyRanges]", error.message);
    return { ranges: [], error: error.message };
  }

  const ranges: CourtBusyRange[] = [];
  for (const row of data ?? []) {
    const { start, end } = parseTstzRange(row.during as string);
    if (!start || !end) continue;
    const status = row.status as string;
    if (status === "cancelled") {
      // Solo bloquea la cancelación tardía (<30 min antes del inicio).
      const cancelledAt = row.cancelled_at ? new Date(row.cancelled_at as string) : null;
      if (!isLateCancelHold(start, cancelledAt)) continue;
      ranges.push({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        status: "held",
      });
      continue;
    }
    ranges.push({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      status,
    });
  }
  return { ranges };
}
