// DELETE /api/v1/walkins/:id?clubId=… (employee/manager)
import { removeWalkin } from "@/server/actions/walkins";
import { httpFail, httpOk } from "@/lib/api/response";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const clubId = url.searchParams.get("clubId") ?? "";
  const r = await removeWalkin({ id, clubId });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "VALIDATION.FAILED" ? 400
      : c === "WALKINS.DELETE_FAILED" ? 500
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
