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

function accessToken(): string | undefined {
  return process.env.MP_ACCESS_TOKEN?.trim() || undefined;
}

function webhookSecret(): string | undefined {
  return process.env.MP_WEBHOOK_SECRET?.trim() || undefined;
}

export const mercadoPagoProvider: PaymentProviderAdapter = {
  key: "mercadopago",

  isConfigured() {
    return Boolean(accessToken());
  },

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const token = accessToken();
    if (!token) {
      throw new MpError(
        "PSP.NOT_CONFIGURED",
        "Mercado Pago no está configurado (MP_ACCESS_TOKEN).",
        503,
      );
    }

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            title: input.description.slice(0, 120),
            quantity: 1,
            unit_price: input.amountCents / 100,
            currency_id: input.currency,
          },
        ],
        metadata: {
          mp_transaction_id: input.transactionId,
          mp_kind: input.kind,
        },
        external_reference: input.transactionId,
        back_urls: {
          success: input.successUrl,
          failure: input.cancelUrl,
          pending: input.cancelUrl,
        },
        auto_return: "approved",
      }),
    });

    const json = (await res.json()) as {
      id?: string;
      init_point?: string;
      message?: string;
    };

    if (!res.ok || !json.init_point || !json.id) {
      throw new MpError(
        "PSP.CHECKOUT_FAILED",
        json.message ?? "No pudimos crear la preferencia en Mercado Pago.",
        502,
      );
    }

    return { checkoutUrl: json.init_point, providerPaymentId: String(json.id) };
  },

  async verifyWebhookRequest(req: Request, rawBody: string): Promise<NormalizedWebhookEvent> {
    const secret = webhookSecret();
    if (secret) {
      const signature = req.headers.get("x-signature");
      const requestId = req.headers.get("x-request-id");
      if (!signature || !requestId) {
        throw new MpError("PSP.WEBHOOK_INVALID", "Faltan headers de Mercado Pago.", 401);
      }
      const expected = createHmac("sha256", secret).update(`${requestId}:${rawBody}`).digest("hex");
      const sigBuf = Buffer.from(signature, "hex");
      const expBuf = Buffer.from(expected, "hex");
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        throw new MpError("PSP.WEBHOOK_INVALID", "Firma Mercado Pago inválida.", 401);
      }
    }

    const payload = JSON.parse(rawBody) as {
      id?: string | number;
      type?: string;
      action?: string;
      data?: { id?: string };
    };

    const providerEventId = String(payload.id ?? payload.data?.id ?? "unknown");
    const eventType = payload.type ?? payload.action ?? "unknown";

    let status: NormalizedWebhookEvent["status"] = "ignored";
    if (eventType.includes("payment") || payload.action === "payment.updated") {
      status = "paid";
    }

    return {
      provider: "mercadopago",
      providerEventId,
      eventType,
      status,
      providerPaymentId: payload.data?.id ?? null,
      transactionId: null,
      rawPayload: payload,
    };
  },
};
