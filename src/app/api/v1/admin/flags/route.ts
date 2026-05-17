import { listFlags, upsertFlag } from "@/server/actions/featureFlags";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET() {
  const r = await listFlags();
  if (!r.ok) {
    const status = r.error.code === "AUTH.ROLE_REQUIRED" ? 403 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await upsertFlag(body);
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
