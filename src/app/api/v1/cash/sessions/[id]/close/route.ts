// POST /api/v1/cash/sessions/:id/close
import { closeCashSession } from "@/server/actions/cash";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await closeCashSession({ id, body });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "CASH.SESSION_NOT_FOUND" ? 404
      : c === "CASH.SESSION_NOT_OPEN" ? 409
      : c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
