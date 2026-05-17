// GET / PATCH / DELETE /api/v1/courts/:id
import { archiveCourt, getCourt, updateCourt } from "@/server/actions/courts";
import { httpFail, httpOk } from "@/lib/api/response";

type Params = { id: string };

export async function GET(_req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params;
  const r = await getCourt({ courtId: id });
  if (!r.ok) {
    const status = r.error.code === "COURTS.NOT_FOUND" ? 404 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}

export async function PATCH(req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await updateCourt({ courtId: id, patch: body });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "COURTS.NOT_FOUND" ? 404
      : code === "AUTH.UNAUTHENTICATED" ? 401
      : code === "AUTH.ROLE_REQUIRED" ? 403
      : code === "COURTS.DUPLICATE_CODE" ? 409
      : code === "VALIDATION.FAILED" ? 400
      : 400;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<Params> }) {
  const { id } = await params;
  const r = await archiveCourt({ courtId: id });
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "COURTS.NOT_FOUND" ? 404
      : code === "AUTH.UNAUTHENTICATED" ? 401
      : code === "AUTH.ROLE_REQUIRED" ? 403
      : 400;
    return httpFail(status, code, r.error.message);
  }
  return httpOk(r.data);
}
