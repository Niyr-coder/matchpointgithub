// GET /api/v1/admin/club-applications?status=&q=&limit=
import { listApplications } from "@/server/actions/clubApplicationsAdmin";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await listApplications({
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!r.ok) {
    const status =
      r.error.code === "AUTH.ROLE_REQUIRED" ? 403 : r.error.code === "AUTH.UNAUTHENTICATED" ? 401 : 400;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
