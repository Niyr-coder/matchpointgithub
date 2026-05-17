// POST /api/v1/refunds (club staff)
import { processRefund } from "@/server/actions/payouts";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await processRefund(body);
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "REFUNDS.TX_NOT_FOUND" ? 404
      : c === "REFUNDS.NOT_CAPTURED" ? 409
      : c === "REFUNDS.AMOUNT_EXCEEDS" ? 422
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data, { status: 201 });
}
