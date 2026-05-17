import { enrollInClass } from "@/server/actions/classes";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { studentId?: string } = {};
  try {
    body = (await req.json()) as { studentId?: string };
  } catch {
    /* empty body fine */
  }
  const r = await enrollInClass({ classId: id, ...body });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "CLASSES.NOT_FOUND" ? 404
      : c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "CLASSES.ALREADY_ENROLLED" ? 409
      : c === "CLASSES.INACTIVE" ? 422
      : c === "VALIDATION.FAILED" ? 400
      : 500;
    return httpFail(status, c, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data, { status: 201 });
}
