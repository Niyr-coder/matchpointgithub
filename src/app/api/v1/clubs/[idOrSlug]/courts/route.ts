// GET /api/v1/clubs/:idOrSlug/courts — public listing of a club's courts
import { listCourtsByClub } from "@/server/actions/courts";
import { getClub } from "@/server/actions/clubs";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request, { params }: { params: Promise<{ idOrSlug: string }> }) {
  const { idOrSlug } = await params;
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") === "true";

  // Resolve slug → id if needed.
  let clubId = idOrSlug;
  if (!/^[0-9a-f-]{36}$/i.test(idOrSlug)) {
    const club = await getClub({ idOrSlug });
    if (!club.ok) return httpFail(404, club.error.code, club.error.message);
    clubId = club.data.club.id;
  }

  const r = await listCourtsByClub({ clubId, includeInactive });
  if (!r.ok) return httpFail(500, r.error.code, r.error.message);
  return httpOk(r.data);
}
