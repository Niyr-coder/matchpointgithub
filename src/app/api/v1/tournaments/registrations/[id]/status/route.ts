// POST /api/v1/tournaments/registrations/:id/status (partner-admin)
import { updateRegistrationStatus } from "@/server/actions/tournaments";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { status?: string };
  try { body = (await req.json()) as { status?: string }; } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await updateRegistrationStatus({ registrationId: id, status: body?.status });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "TOURNAMENTS.REG_NOT_FOUND" ? 404
      : c === "TOURNAMENTS.PARTNER_REQUIRED" ? 422
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
