// POST /api/v1/classes/sessions/:id/attendance (coach)
import { markAttendance } from "@/server/actions/classes";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { studentId?: string; attended?: boolean };
  try { body = (await req.json()) as { studentId?: string; attended?: boolean }; } catch { return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON"); }
  const r = await markAttendance({
    classSessionId: id,
    studentId: body?.studentId,
    attended: body?.attended,
  });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "CLASSES.NOT_FOUND" ? 404
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
