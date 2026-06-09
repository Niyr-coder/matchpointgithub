// Tipos compartidos del layer PSP. Sin dependencias server-only.
import type { z } from "zod";

export const PAYMENT_PROVIDER_KEYS = ["manual", "stripe", "mercadopago"] as const;
export type PaymentProviderKey = (typeof PAYMENT_PROVIDER_KEYS)[number];

/** Kinds elegibles para checkout PSP en piloto (expandir con flag/cohorte). */
export const PSP_CHECKOUT_KINDS = [
  "plan",
  "tournament",
  "event",
  "club_featuring",
] as const;
export type PspCheckoutKind = (typeof PSP_CHECKOUT_KINDS)[number];

export type CreateCheckoutInput = {
  transactionId: string;
  amountCents: number;
  currency: string;
  kind: string;
  customerUserId: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
};

export type CreateCheckoutResult = {
  checkoutUrl: string;
  providerPaymentId: string;
};

export type WebhookEventStatus = "paid" | "failed" | "refunded" | "ignored";

export type NormalizedWebhookEvent = {
  provider: PaymentProviderKey;
  providerEventId: string;
  eventType: string;
  status: WebhookEventStatus;
  providerPaymentId: string | null;
  transactionId: string | null;
  rawPayload: unknown;
};

export interface PaymentProviderAdapter {
  readonly key: PaymentProviderKey;
  isConfigured(): boolean;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  verifyWebhookRequest(req: Request, rawBody: string): Promise<NormalizedWebhookEvent>;
}

export function isPspCheckoutKind(kind: string): kind is PspCheckoutKind {
  return (PSP_CHECKOUT_KINDS as readonly string[]).includes(kind);
}

/** Metadata estándar embebida en checkout PSP → webhook. */
export function buildCheckoutMetadata(transactionId: string, kind: string): Record<string, string> {
  return {
    mp_transaction_id: transactionId,
    mp_kind: kind,
  };
}

export function parseTransactionIdFromMetadata(
  metadata: Record<string, string> | null | undefined,
): string | null {
  if (!metadata) return null;
  const id = metadata.mp_transaction_id ?? metadata.transaction_id;
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
