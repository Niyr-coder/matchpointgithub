// GET    /api/v1/club-applications/:id  → ClubApplicationDetail
// PATCH  /api/v1/club-applications/:id  → ClubApplication
// DELETE /api/v1/club-applications/:id  → ClubApplication (withdrawn)
import {
  getApplicationDetail,
  updateApplication,
  withdrawApplication,
} from "@/server/actions/clubApplications";
import { httpFail, httpOk } from "@/lib/api/response";

type Params = { id: string };

export async function GET(_req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params;
  const r = await getApplicationDetail({ applicationId: id });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "CLUB_APP.NOT_FOUND"
        ? 404
        : code === "AUTH.UNAUTHENTICATED"
          ? 401
          : 500;
    return httpFail(status, code, r.error.message);
  }
  return httpOk(r.data);
}

export async function PATCH(req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await updateApplication({ applicationId: id, patch: body });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "VALIDATION.FAILED"
        ? 400
        : code === "CLUB_APP.NOT_FOUND"
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

export async function DELETE(req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params;
  let reason: string | undefined;
  try {
    const body = (await req.json()) as { reason?: string };
    reason = body?.reason;
  } catch {
    /* no body is fine */
  }
  const r = await withdrawApplication({ applicationId: id, reason });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "CLUB_APP.TRANSITION_FORBIDDEN"
        ? 409
        : code === "AUTH.UNAUTHENTICATED"
          ? 401
          : 400;
    return httpFail(status, code, r.error.message);
  }
  return httpOk(r.data);
}
