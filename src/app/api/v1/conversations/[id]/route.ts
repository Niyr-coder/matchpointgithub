import { getConversation } from "@/server/actions/messaging";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit") ?? undefined;
  const r = await getConversation({ id, limit });
  if (!r.ok) {
    const status = r.error.code === "MESSAGING.NOT_FOUND" ? 404 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
