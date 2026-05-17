// POST /api/v1/auth/sign-in
import { signIn } from "@/server/actions/auth";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const result = await signIn(body);
  if (!result.ok) {
    // status from code; default 400
    const code = result.error.code;
    const status =
      code === "AUTH.INVALID_CREDENTIALS"
        ? 401
        : code === "VALIDATION.FAILED"
          ? 400
          : 400;
    return httpFail(status, code, result.error.message, {
      fields: result.error.fields,
      requestId: result.error.requestId,
    });
  }
  return httpOk(result.data);
}
