import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { parseTstzRange } from "@/lib/reservations/during-range";

export type CourtBusyRange = {
  startsAt: string;
  endsAt: string;
  status: string;
};

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
    .select("during, status")
    .eq("club_id", clubId)
    .eq("court_id", courtId)
    .neq("status", "cancelled")
    .overlaps("during", range);

  if (error) {
    console.error("[loadCourtBusyRanges]", error.message);
    return { ranges: [], error: error.message };
  }

  const ranges: CourtBusyRange[] = [];
  for (const row of data ?? []) {
    const { start, end } = parseTstzRange(row.during as string);
    if (!start || !end) continue;
    ranges.push({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      status: row.status as string,
    });
  }
  return { ranges };
}
