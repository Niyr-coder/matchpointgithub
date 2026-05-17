// GET  /api/v1/conversations — list mine
// POST /api/v1/conversations — start (DM auto-dedupe)
import { listMyConversations, startConversation } from "@/server/actions/messaging";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET() {
  const r = await listMyConversations();
  if (!r.ok) {
    const status = r.error.code === "AUTH.UNAUTHENTICATED" ? 401 : 500;
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
  const r = await startConversation(body);
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "VALIDATION.FAILED" ? 400
      : c === "RATE_LIMIT.EXCEEDED" ? 429
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data, { status: 201 });
}
