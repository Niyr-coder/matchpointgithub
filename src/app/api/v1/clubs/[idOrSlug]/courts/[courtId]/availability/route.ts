// GET /api/v1/clubs/:idOrSlug/courts/:courtId/availability?from=&to=
// Tramos ocupados de la cancha (sin datos de otros jugadores).
import { getClub } from "@/server/actions/clubs";
import { loadCourtBusyRanges } from "@/server/queries/court-busy-ranges";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ idOrSlug: string; courtId: string }> },
) {
  const { idOrSlug, courtId } = await params;
  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  if (!fromRaw || !toRaw) {
    return httpFail(400, "VALIDATION.FAILED", "Query params from and to are required");
  }
  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return httpFail(400, "VALIDATION.FAILED", "Invalid from or to datetime");
  }

  let clubId = idOrSlug;
  if (!/^[0-9a-f-]{36}$/i.test(idOrSlug)) {
    const club = await getClub({ idOrSlug });
    if (!club.ok) return httpFail(404, club.error.code, club.error.message);
    clubId = club.data.club.id;
  }

  const { ranges, error } = await loadCourtBusyRanges(clubId, courtId, from, to);
  if (error) {
    return httpFail(500, "AVAILABILITY.FAILED", "No se pudo cargar la disponibilidad de la cancha");
  }
  return httpOk(ranges);
}
