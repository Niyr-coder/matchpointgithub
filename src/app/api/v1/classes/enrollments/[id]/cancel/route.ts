// POST /api/v1/classes/enrollments/:id/cancel
import { cancelEnrollment } from "@/server/actions/classes";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await cancelEnrollment({ enrollmentId: id });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "ENROLLMENT.NOT_FOUND" ? 404
      : c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "ENROLLMENT.NOT_CANCELLABLE" ? 409
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
