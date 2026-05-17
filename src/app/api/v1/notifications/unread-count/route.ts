// GET /api/v1/notifications/unread-count
import { getUnreadCount } from "@/server/actions/notifications";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const role = url.searchParams.get("role") ?? undefined;
  const r = await getUnreadCount(role ? { role } : {});
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
