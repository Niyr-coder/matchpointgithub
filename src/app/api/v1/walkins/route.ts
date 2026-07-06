// POST /api/v1/walkins (employee/manager)
import { createWalkinReservation } from "@/server/actions/reservations";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await createWalkinReservation(body);
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "AUTH.UNAUTHENTICATED" ? 401
      : code === "AUTH.ROLE_REQUIRED" ? 403
      : code === "VALIDATION.FAILED" ? 400
      : code === "WALKIN.COURT_REQUIRED" ? 422
      : code === "RESERVATION.SLOT_TAKEN" ? 409
      : 500;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data, { status: 201 });
}
