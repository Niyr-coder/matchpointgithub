// GET  /api/v1/cash/sessions?clubId=...
// POST /api/v1/cash/sessions/open
import { listCashSessions, openCashSession } from "@/server/actions/cash";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await listCashSessions(Object.fromEntries(url.searchParams.entries()));
  if (!r.ok) {
    const status =
      r.error.code === "AUTH.UNAUTHENTICATED" ? 401
      : r.error.code === "AUTH.ROLE_REQUIRED" ? 403
      : r.error.code === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await openCashSession(body);
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "CASH.SESSION_ALREADY_OPEN" ? 409
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data, { status: 201 });
}
