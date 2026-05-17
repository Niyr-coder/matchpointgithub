// POST /api/v1/reservations/:id/cancel
import { cancelReservation } from "@/server/actions/reservations";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { reason?: string } = {};
  try {
    body = (await req.json()) as { reason?: string };
  } catch {
    /* empty body is fine */
  }
  const r = await cancelReservation({ id, body });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "RESERVATIONS.NOT_FOUND" ? 404
      : code === "AUTH.UNAUTHENTICATED" ? 401
      : code === "AUTH.ROLE_REQUIRED" ? 403
      : code === "RESERVATION.CANNOT_CANCEL" ? 409
      : code === "RESERVATION.WINDOW_CLOSED" ? 422
      : 400;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data);
}
