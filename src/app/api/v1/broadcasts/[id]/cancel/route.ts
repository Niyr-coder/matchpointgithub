import { cancelBroadcast } from "@/server/actions/marketing";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await cancelBroadcast({ id });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "BROADCASTS.NOT_FOUND" ? 404
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "BROADCASTS.NOT_CANCELLABLE" ? 409
      : 400;
    return httpFail(status, c, r.error.message);
  }
  return httpOk(r.data);
}
