import { confirmMatchResult } from "@/server/actions/ranking";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await confirmMatchResult({ id });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "MATCH.NOT_FOUND" ? 404
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "MATCH.NOT_REPORTED" ? 409
      : 400;
    return httpFail(status, c, r.error.message);
  }
  return httpOk(r.data);
}
