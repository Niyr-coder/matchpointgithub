// GET  /api/v1/me/plan — plan vigente del user actual
// POST /api/v1/me/plan — solicita upgrade de plan (free → premium)
import { getCurrentPlan, requestPlanUpgrade } from "@/server/actions/player-subscriptions";
import { httpFail, httpOk } from "@/lib/api/response";

export async function GET() {
  const r = await getCurrentPlan();
  if (!r.ok) {
    const code = r.error.code;
    const status = code === "AUTH.UNAUTHENTICATED" ? 401 : 500;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(r.data);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return httpFail(400, "VALIDATION.INVALID_JSON", "Request body must be JSON");
  }
  const r = await requestPlanUpgrade(body);
  if (!r.ok) {
    const code = r.error.code;
    const status =
      code === "AUTH.UNAUTHENTICATED" ? 401
      : code === "VALIDATION.FAILED" ? 400
      : code === "PLAN.PENDING_EXISTS" ? 409
      : code === "PLAN.TX_CREATE_FAILED" || code === "PLAN.SUB_CREATE_FAILED" ? 500
      : 500;
    return httpFail(status, code, r.error.message, {
      fields: r.error.fields,
      requestId: r.error.requestId,
    });
  }
  return httpOk(
    {
      subscriptionId: r.data.subscriptionId,
      transactionId: r.data.transactionId,
      amountCents: r.data.amountCents,
      nextStep: `/pagos/${r.data.transactionId}`,
    },
    { status: 201 },
  );
}
