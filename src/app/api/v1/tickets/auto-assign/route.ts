// POST /api/v1/tickets/auto-assign (admin)
import { autoAssignTickets } from "@/server/actions/support";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST() {
  const r = await autoAssignTickets();
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "TICKETS.NO_ADMINS" ? 422
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
