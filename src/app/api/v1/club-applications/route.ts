// POST /api/v1/club-applications — start a new draft (auto-bound to current user).
import { createApplication } from "@/server/actions/clubApplications";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST() {
  const r = await createApplication();
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "AUTH.UNAUTHENTICATED"
        ? 401
        : code === "CLUB_APP.ALREADY_OPEN"
          ? 409
          : 500;
    return httpFail(status, code, r.error.message);
  }
  return httpOk(r.data, { status: 201 });
}
