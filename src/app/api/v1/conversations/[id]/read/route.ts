import { markRead } from "@/server/actions/messaging";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await markRead({ id, body });
  if (!r.ok) {
    const status = r.error.code === "AUTH.UNAUTHENTICATED" ? 401 : 400;
    return httpFail(status, r.error.code, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
