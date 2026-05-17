// GET /api/v1/me/club-application — the user's draft/most-recent application.
import { getMyApplication } from "@/server/actions/clubApplications";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET() {
  const r = await getMyApplication();
  if (!r.ok) {
    const status = r.error.code === "AUTH.UNAUTHENTICATED" ? 401 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
