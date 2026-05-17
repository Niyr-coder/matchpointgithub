// POST /api/v1/payouts/:id/paid (admin)
import { markPayoutPaid } from "@/server/actions/payouts";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { providerPayoutId?: string } = {};
  try { body = (await req.json()) as { providerPayoutId?: string }; } catch { /* body opcional */ }
  const r = await markPayoutPaid({ id, providerPayoutId: body?.providerPayoutId });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "VALIDATION.FAILED" ? 400
      : c === "PAYOUTS.UPDATE_FAILED" ? 500
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
