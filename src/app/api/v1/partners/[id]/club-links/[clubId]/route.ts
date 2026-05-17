// DELETE /api/v1/partners/:id/club-links/:clubId (partner-admin)
import { unlinkClubFromPartner } from "@/server/actions/partners";
import { httpFail, httpOk } from "@/lib/api/response";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; clubId: string }> },
) {
  const { id, clubId } = await params;
  const r = await unlinkClubFromPartner({ partnerId: id, clubId });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "VALIDATION.FAILED" ? 400
      : c === "PARTNERS.UNLINK_FAILED" ? 500
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
