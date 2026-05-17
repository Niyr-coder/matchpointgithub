// POST /api/v1/auth/switch-role
import { switchRole } from "@/server/actions/auth";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const result = await switchRole(body);
  if (!result.ok) {
    const code = result.error.code;
    const status =
      code === "AUTH.UNAUTHENTICATED"
        ? 401
        : code === "AUTH.ROLE_REQUIRED"
          ? 403
          : 400;
    return httpFail(status, code, result.error.message, {
      fields: result.error.fields,
      requestId: result.error.requestId,
    });
  }
  return httpOk(result.data);
}
