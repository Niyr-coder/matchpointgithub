// POST /api/v1/roles/requests/approve
import { approveRoleRequest } from "@/server/actions/roles";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await approveRoleRequest(body);
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
