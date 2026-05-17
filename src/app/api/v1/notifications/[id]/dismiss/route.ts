// POST /api/v1/notifications/:id/dismiss
import { dismissNotification } from "@/server/actions/notifications";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await dismissNotification({ id });
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
