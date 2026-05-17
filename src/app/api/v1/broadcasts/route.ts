import { createBroadcast, listBroadcasts } from "@/server/actions/marketing";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await listBroadcasts(Object.fromEntries(url.searchParams.entries()));
  if (!r.ok) return httpFail(500, r.error.code, r.error.message);
  return httpOk(r.data);
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await createBroadcast(body);
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "BROADCASTS.SCOPE_INVALID" ? 422
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data, { status: 201 });
}
