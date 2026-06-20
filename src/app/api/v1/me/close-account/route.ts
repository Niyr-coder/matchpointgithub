import {
  cancelAccountClosure,
  requestAccountClosure,
} from "@/server/actions/account-privacy";
import { httpFail, httpOk } from "@/lib/api/response";

const BAD_REQUEST = new Set([
  "VALIDATION.FAILED",
  "ACCOUNT.USERNAME_MISMATCH",
  "ACCOUNT.OWNER_CLUBS_BLOCK",
]);

/** POST /api/v1/me/close-account — programar cierre con período de gracia. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "El cuerpo debe ser JSON");
  }
  const r = await requestAccountClosure(body);
  if (!r.ok) {
    const status =
      r.error.code === "AUTH.UNAUTHENTICATED"
        ? 401
        : BAD_REQUEST.has(r.error.code)
          ? 400
          : 500;
    return httpFail(status, r.error.code, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}

/** DELETE /api/v1/me/close-account — cancelar cierre programado. */
export async function DELETE() {
  const r = await cancelAccountClosure();
  if (!r.ok) {
    const status = r.error.code === "AUTH.UNAUTHENTICATED" ? 401 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
