import { getEvent, registerToEvent } from "@/server/actions/events";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request, { params }: { params: Promise<{ idOrSlug: string }> }) {
  const { idOrSlug } = await params;
  let id = idOrSlug;
  if (!/^[0-9a-f-]{36}$/i.test(idOrSlug)) {
    const lookup = await getEvent({ idOrSlug });
    if (!lookup.ok) return httpFail(404, lookup.error.code, lookup.error.message);
    id = lookup.data.id;
  }
  // El body es opcional; solo lo leemos para extraer paymentMode (online|onsite)
  // requerido cuando event.payment_policy === 'flexible'.
  let paymentMode: unknown;
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const parsed = await req.json();
      if (parsed && typeof parsed === "object") {
        paymentMode = (parsed as Record<string, unknown>).paymentMode;
      }
    }
  } catch { /* sin body, ok */ }
  const r = await registerToEvent({ id, paymentMode });
  if (!r.ok) {
    const c = r.error.code;
    const status =
      c === "AUTH.UNAUTHENTICATED" ? 401
      : c === "EVENTS.NOT_FOUND" ? 404
      : c === "EVENTS.NOT_REGISTERABLE" ? 422
      : c === "EVENTS.FULL" || c === "EVENTS.ALREADY_REGISTERED" ? 409
      : 400;
    return httpFail(status, c, r.error.message);
  }
  return httpOk(r.data, { status: 201 });
}
