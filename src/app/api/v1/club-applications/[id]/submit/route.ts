// POST /api/v1/club-applications/:id/submit
import { submitApplication } from "@/server/actions/clubApplications";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await submitApplication({ applicationId: id, body });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "VALIDATION.FAILED"
        ? 400
        : code === "CLUB_APP.NOT_FOUND"
          ? 404
          : code === "CLUB_APP.TRANSITION_FORBIDDEN"
            ? 409
            : code === "CLUB_APP.STEP_INVALID"
              ? 422
              : 500;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data);
}
