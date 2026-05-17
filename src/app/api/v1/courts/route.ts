// POST /api/v1/courts — create court (staff)
import { createCourt } from "@/server/actions/courts";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await createCourt(body);
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "AUTH.UNAUTHENTICATED" ? 401
      : code === "AUTH.ROLE_REQUIRED" ? 403
      : code === "COURTS.DUPLICATE_CODE" ? 409
      : code === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data, { status: 201 });
}
