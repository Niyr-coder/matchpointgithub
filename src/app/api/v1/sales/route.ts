// POST /api/v1/sales — employee POS quick-sale (idempotent)
import { createSale } from "@/server/actions/proshop";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await createSale(body);
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "PROSHOP.NOT_FOUND" ? 404
      : c === "PROSHOP.OUT_OF_STOCK" || c === "PROSHOP.INACTIVE" || c === "PROSHOP.CLUB_MISMATCH"
        || c === "PROSHOP.CURRENCY_MIXED" || c === "PROSHOP.EMPTY" || c === "CASH.SESSION_CLOSED" ? 422
      : c === "VALIDATION.FAILED" ? 400
      : c === "IDEMPOTENCY.MISMATCH" ? 409
      : c === "RATE_LIMIT.EXCEEDED" ? 429
      : 500;
    return httpFail(status, c, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data, { status: 201 });
}
