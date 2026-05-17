// POST /api/v1/partners/:id/club-links (partner-admin)
import { linkClubToPartner } from "@/server/actions/partners";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { clubId?: string; revenueSharePct?: number };
  try { body = (await req.json()) as { clubId?: string; revenueSharePct?: number }; } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await linkClubToPartner({
    partnerId: id,
    clubId: body?.clubId,
    revenueSharePct: body?.revenueSharePct,
  });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "VALIDATION.FAILED" ? 400
      : c === "PARTNERS.LINK_FAILED" ? 500
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data, { status: 201 });
}
