import { listReports } from "@/server/actions/moderation";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await listReports(Object.fromEntries(url.searchParams.entries()));
  if (!r.ok) {
    const status =
      r.error.code === "AUTH.ROLE_REQUIRED" ? 403
      : r.error.code === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
