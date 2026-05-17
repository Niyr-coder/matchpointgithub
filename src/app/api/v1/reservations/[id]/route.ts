// GET /api/v1/reservations/:id — detail (reservation + participants)
import { getReservation } from "@/server/actions/reservations";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getReservation({ id });
  if (!r.ok) {
    const status = r.error.code === "RESERVATIONS.NOT_FOUND" ? 404 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
