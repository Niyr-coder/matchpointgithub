// DELETE /api/v1/admin/flags/:key
import { deleteFlag } from "@/server/actions/featureFlags";
import { httpFail, httpOk } from "@/lib/api/response";

export async function DELETE(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const r = await deleteFlag({ key });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
