import { createLeague, listLeagues } from "@/server/actions/tournaments";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET() {
  const r = await listLeagues();
  if (!r.ok) return httpFail(500, r.error.code, r.error.message);
  return httpOk(r.data);
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await createLeague(body);
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "LEAGUES.SLUG_TAKEN" ? 409
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data, { status: 201 });
}
