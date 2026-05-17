// PATCH /api/v1/coaches/profile (coach acts on own profile)
import { updateCoachProfile } from "@/server/actions/coaches";
import { httpFail, httpOk } from "@/lib/api/response";

export async function PATCH(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await updateCoachProfile(body);
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "VALIDATION.FAILED" ? 400
      : c === "COACHES.UPDATE_FAILED" ? 500
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
