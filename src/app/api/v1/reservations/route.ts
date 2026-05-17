// GET  /api/v1/reservations — list (filters)
// POST /api/v1/reservations — create (idempotent)
import { createReservation, listReservations } from "@/server/actions/reservations";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await listReservations(Object.fromEntries(url.searchParams.entries()));
  if (!r.ok) {
    const status = r.error.code === "VALIDATION.FAILED" ? 400 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await createReservation(body);
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "AUTH.UNAUTHENTICATED" ? 401
      : code === "VALIDATION.FAILED" ? 400
      : code === "RESERVATION.SLOT_TAKEN" ? 409
      : code === "RESERVATION.OUTSIDE_WINDOW" || code === "RESERVATION.IN_PAST" ? 422
      : code === "RATE_LIMIT.EXCEEDED" ? 429
      : code === "IDEMPOTENCY.MISMATCH" ? 409
      : 500;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data, { status: 201 });
}
