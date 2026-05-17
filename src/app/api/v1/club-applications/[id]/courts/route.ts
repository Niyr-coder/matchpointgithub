// POST /api/v1/club-applications/:id/courts → ClubApplicationCourt
import { addApplicationCourt } from "@/server/actions/clubApplications";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await addApplicationCourt({ applicationId: id, data: body });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "VALIDATION.FAILED"
        ? 400
        : code === "AUTH.UNAUTHENTICATED"
          ? 401
          : 400;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data, { status: 201 });
}
