// GET /api/v1/clubs — public listing with filters
import { listClubs } from "@/server/actions/clubs";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const r = await listClubs(params);
  if (!r.ok) return httpFail(r.error.code === "VALIDATION.FAILED" ? 400 : 500, r.error.code, r.error.message);
  return httpOk(r.data);
}
