// POST /api/v1/tickets/:id/assign (admin/staff)
import { assignTicket } from "@/server/actions/support";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { assigneeId?: string | null };
  try { body = (await req.json()) as { assigneeId?: string | null }; } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await assignTicket({ id, assigneeId: body?.assigneeId ?? null });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "TICKETS.NOT_FOUND" ? 404
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
