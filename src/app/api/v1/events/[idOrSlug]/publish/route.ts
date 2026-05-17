import { getEvent, publishEvent } from "@/server/actions/events";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(_req: Request, { params }: { params: Promise<{ idOrSlug: string }> }) {
  const { idOrSlug } = await params;
  // Resolve slug → uuid if needed (publishEvent takes a UUID).
  let id = idOrSlug;
  if (!/^[0-9a-f-]{36}$/i.test(idOrSlug)) {
    const lookup = await getEvent({ idOrSlug });
    if (!lookup.ok) return httpFail(404, lookup.error.code, lookup.error.message);
    id = lookup.data.id;
  }
  const r = await publishEvent({ id });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "EVENTS.NOT_FOUND" ? 404
      : c === "AUTH.ROLE_REQUIRED" ? 403
      : c === "EVENTS.NOT_DRAFT" ? 409
      : 400;
    return httpFail(status, c, r.error.message);
  }
  return httpOk(r.data);
}
