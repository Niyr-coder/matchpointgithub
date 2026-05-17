// PATCH/DELETE /api/v1/club-applications/:id/courts/:courtId
import {
  removeApplicationCourt,
  updateApplicationCourt,
} from "@/server/actions/clubApplications";
import { httpFail, httpOk } from "@/lib/api/response";

type Params = { id: string; courtId: string };

export async function PATCH(req: Request, { params }: { params: Promise<Params> }) {
  const { id, courtId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await updateApplicationCourt({ applicationId: id, courtId, patch: body });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "VALIDATION.FAILED"
        ? 400
        : code === "CLUB_APP.COURT_NOT_FOUND"
          ? 404
          : code === "AUTH.UNAUTHENTICATED"
            ? 401
            : 400;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<Params> }) {
  const { id, courtId } = await params;
  const r = await removeApplicationCourt({ applicationId: id, courtId });
  if (!r.ok) {
    return httpFail(400, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
