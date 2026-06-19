import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { MpError } from "@/lib/api/errors";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedWebhookEvent,
  PaymentProviderAdapter,
} from "@/lib/payments/types";
import { parseTransactionIdFromMetadata } from "@/lib/payments/types";

const API_BASE = "https://api.stripe.com/v1";

function secretKey(): string | undefined {
  return process.env.STRIPE_SECRET_KEY?.trim() || undefined;
}

function webhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
}

function formBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

export const stripeProvider: PaymentProviderAdapter = {
  key: "stripe",

  isConfigured() {
    return Boolean(secretKey());
  },

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const sk = secretKey();
    if (!sk) {
      throw new MpError(
        "PSP.NOT_CONFIGURED",
        "Stripe no está configurado (STRIPE_SECRET_KEY).",
        503,
      );
    }

    const body = formBody({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][price_data][currency]": input.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(input.amountCents),
      "line_items[0][price_data][product_data][name]": input.description.slice(0, 120),
      "line_items[0][quantity]": "1",
      "metadata[mp_transaction_id]": input.transactionId,
      "metadata[mp_kind]": input.kind,
      "client_reference_id": input.transactionId,
    });

    const res = await fetch(`${API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sk}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const json = (await res.json()) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    };

    if (!res.ok || !json.url || !json.id) {
      throw new MpError(
        "PSP.CHECKOUT_FAILED",
        json.error?.message ?? "No pudimos crear la sesión de pago en Stripe.",
        502,
      );
    }

    return { checkoutUrl: json.url, providerPaymentId: json.id };
  },

  async verifyWebhookRequest(req: Request, rawBody: string): Promise<NormalizedWebhookEvent> {
    const whSecret = webhookSecret();
    if (!whSecret) {
      throw new MpError("PSP.NOT_CONFIGURED", "STRIPE_WEBHOOK_SECRET no configurado.", 503);
    }

    const sigHeader = req.headers.get("stripe-signature");
    if (!sigHeader) {
      throw new MpError("PSP.WEBHOOK_INVALID", "Falta stripe-signature.", 401);
    }

    const parts = Object.fromEntries(
      sigHeader.split(",").map((p) => {
        const [k, v] = p.split("=");
        return [k, v];
      }),
    ) as Record<string, string>;
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) {
      throw new MpError("PSP.WEBHOOK_INVALID", "stripe-signature mal formada.", 401);
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = createHmac("sha256", whSecret).update(signedPayload).digest("hex");
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new MpError("PSP.WEBHOOK_INVALID", "Firma Stripe inválida.", 401);
    }

    const event = JSON.parse(rawBody) as {
      id: string;
      type: string;
      data?: { object?: Record<string, unknown> };
    };

    const obj = event.data?.object ?? {};
    const metadata = (obj.metadata as Record<string, string> | undefined) ?? {};
    const transactionId =
      parseTransactionIdFromMetadata(metadata) ??
      (typeof obj.client_reference_id === "string" ? obj.client_reference_id : null);

    let status: NormalizedWebhookEvent["status"] = "ignored";
    if (event.type === "checkout.session.completed") status = "paid";
    else if (event.type === "checkout.session.expired") status = "failed";
    else if (event.type === "charge.refunded") status = "refunded";

    return {
      provider: "stripe",
      providerEventId: event.id,
      eventType: event.type,
      status,
      providerPaymentId: typeof obj.id === "string" ? obj.id : null,
      transactionId,
      rawPayload: event,
    };
  },
};
