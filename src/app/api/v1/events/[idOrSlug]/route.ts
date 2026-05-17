import { getEvent } from "@/server/actions/events";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET(_req: Request, { params }: { params: Promise<{ idOrSlug: string }> }) {
  const { idOrSlug } = await params;
  const r = await getEvent({ idOrSlug });
  if (!r.ok) {
    const status = r.error.code === "EVENTS.NOT_FOUND" ? 404 : 500;
    return httpFail(status, r.error.code, r.error.message);
  }
  return httpOk(r.data);
}
