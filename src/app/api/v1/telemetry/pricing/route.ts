// POST /api/v1/telemetry/pricing — registra eventos pricing_* en
// paywall_events. Acepta anon y authenticated. Fire-and-forget desde el
// cliente (helper en src/lib/telemetry/pricing.ts).
//
// Si payload o storage falla, devolvemos 200 con `recorded:false` salvo en
// validación: ahí 400 para que el dev vea el error en consola y arregle.
import { trackPricingEvent } from "@/server/actions/telemetry";
import { httpFail, httpOk } from "@/lib/api/response";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Body must be JSON");
  }
  const r = await trackPricingEvent(body);
  if (!r.ok) {
    const status = r.error.code === "VALIDATION.FAILED" ? 400 : 500;
    return httpFail(status, r.error.code, r.error.message, { fields: r.error.fields });
  }
  return httpOk(r.data);
}
