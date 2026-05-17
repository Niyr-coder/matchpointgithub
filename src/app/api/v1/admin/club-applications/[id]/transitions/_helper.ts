// Shared helper used by every transition route: parse body (optional),
// inject `applicationId` from the URL, map errors uniformly.
import { httpFail, httpOk } from "@/lib/api/response";
import type { ActionResult } from "@/lib/api/action";

type Handler = (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

export function adminTransition<T>(
  action: (input: unknown) => Promise<ActionResult<T>>,
): Handler {
  return async (req, { params }) => {
    const { id } = await params;
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      /* empty body is fine for most transitions */
    }
    const r = await action({ ...body, applicationId: id });
    if (!r.ok) {
      const code = r.error.code;
      const status =
        code === "AUTH.UNAUTHENTICATED"
          ? 401
          : code === "AUTH.ROLE_REQUIRED"
            ? 403
            : code === "CLUB_APP.NOT_FOUND" || code === "CLUB_APP.DOC_NOT_FOUND"
              ? 404
              : code === "CLUB_APP.TRANSITION_FORBIDDEN"
                ? 409
                : code === "VALIDATION.FAILED" || code === "CLUB_APP.STEP_INVALID"
                  ? 422
                  : 500;
      return httpFail(status, code, r.error.message, {
        fields: r.error.fields,
        requestId: r.error.requestId,
      });
    }
    return httpOk(r.data);
  };
}
