import { NextResponse } from "next/server";
import { MpError } from "@/lib/api/errors";
import { captureError } from "@/lib/observability/sentry";
import { processPaymentWebhook, readWebhookBody } from "@/lib/payments/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const rawBody = await readWebhookBody(req);
    const result = await processPaymentWebhook("mercadopago", req, rawBody);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MpError) {
      return NextResponse.json({ ok: false, code: err.code, message: err.message }, { status: err.status });
    }
    captureError(err, { layer: "webhook", provider: "mercadopago" });
    return NextResponse.json({ ok: false, code: "INTERNAL.UNEXPECTED" }, { status: 500 });
  }
}
