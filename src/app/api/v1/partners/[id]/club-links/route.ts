// POST /api/v1/partners/:id/club-links (partner-admin)
import { linkClubToPartner } from "@/server/actions/partners";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { linkCode?: string; revenueSharePct?: number };
  try { body = (await req.json()) as { linkCode?: string; revenueSharePct?: number }; } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await linkClubToPartner({
    partnerId: id,
    linkCode: body?.linkCode,
    revenueSharePct: body?.revenueSharePct,
  });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "VALIDATION.FAILED" ? 400
      : c === "PARTNERS.CODE_INVALID" ? 404
      : c === "PARTNERS.CLUB_INACTIVE" ? 409
      : c === "PARTNERS.LINK_FAILED" ? 500
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data, { status: 201 });
}
