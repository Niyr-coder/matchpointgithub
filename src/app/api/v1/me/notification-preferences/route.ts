import { listMyPreferences, updateMyPreferences } from "@/server/actions/notifications";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET() {
  const r = await listMyPreferences();
  if (!r.ok) {
    const status = r.error.code === "AUTH.UNAUTHENTICATED" ? 401 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}

export async function PATCH(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await updateMyPreferences(body);
  if (!r.ok) return httpFail(r.error.code === "VALIDATION.FAILED" ? 400 : 500, r.error.code, r.error.message, { fields: r.error.fields });
  return httpOk(r.data);
}
