// POST /api/v1/admin/clubs/:id/suspend (admin)
import { suspendClub } from "@/server/actions/clubs";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { reason?: string } = {};
  try { body = (await req.json()) as { reason?: string }; } catch { /* opcional */ }
  void body?.reason;
  const r = await suspendClub({ clubId: id });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "VALIDATION.FAILED" ? 400
      : c === "CLUBS.UPDATE_FAILED" ? 500
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
