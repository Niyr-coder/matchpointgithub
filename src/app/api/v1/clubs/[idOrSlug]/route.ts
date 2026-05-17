// GET    /api/v1/clubs/:idOrSlug — public detail (uuid or slug)
// PATCH  /api/v1/clubs/:idOrSlug — owner/admin update (uuid only)
import { getClub, updateClub } from "@/server/actions/clubs";
import { httpFail, httpOk } from "@/lib/api/response";

type Params = { idOrSlug: string };

export async function GET(_req: Request, { params }: { params: Promise<Params> }) {
  const { idOrSlug } = await params;
  const r = await getClub({ idOrSlug });
  if (!r.ok) {
    const status = r.error.code === "CLUBS.NOT_FOUND" ? 404 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}

export async function PATCH(req: Request, { params }: { params: Promise<Params> }) {
  const { idOrSlug } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await updateClub({ clubId: idOrSlug, patch: body });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "AUTH.UNAUTHENTICATED" ? 401
      : code === "AUTH.ROLE_REQUIRED" ? 403
      : code === "CONCURRENT_UPDATE" ? 409
      : code === "VALIDATION.FAILED" ? 400
      : 400;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data);
}
