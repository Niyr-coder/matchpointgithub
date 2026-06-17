// Inicio de checkout PSP sobre una transaction existente.
import "server-only";

import { headers } from "next/headers";
import { getAdminClient } from "@/lib/db/client.admin";
import { MpError } from "@/lib/api/errors";
import { buildCheckoutMetadata, isPspCheckoutKind } from "@/lib/payments/types";
import { defaultPaymentProviderKey, resolvePaymentProvider } from "@/lib/payments/registry";
import { isPspCheckoutEnabled } from "@/server/flags/psp-checkout";
import type { PaymentProviderKey } from "@/lib/payments/types";

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const explicitOrigin = h.get("origin");
  if (explicitOrigin) return explicitOrigin;
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || (process.env.NODE_ENV === "production" ? "https" : "http");
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export type BeginPspCheckoutResult = {
  checkoutUrl: string;
  provider: PaymentProviderKey;
  providerPaymentId: string;
};

export async function beginPspCheckout(opts: {
  transactionId: string;
  userId: string;
  provider?: PaymentProviderKey;
}): Promise<BeginPspCheckoutResult> {
  if (!(await isPspCheckoutEnabled())) {
    throw new MpError(
      "PSP.DISABLED",
      "El pago con tarjeta aún no está disponible. Usa transferencia o DeUna.",
      403,
    );
  }

  const admin = getAdminClient();
  const { data: tx, error } = await admin
    .from("transactions")
    .select("id,status,kind,amount_cents,currency,customer_user_id,customer_name,club_id")
    .eq("id", opts.transactionId)
    .maybeSingle();

  if (error) throw new MpError("PSP.DB_ERROR", error.message, 500);
  if (!tx) throw new MpError("PSP.TX_NOT_FOUND", "Transacción no encontrada.", 404);
  if (tx.customer_user_id !== opts.userId) {
    throw new MpError("PSP.FORBIDDEN", "Esta transacción no es tuya.", 403);
  }
  if (!isPspCheckoutKind(tx.kind as string)) {
    throw new MpError(
      "PSP.KIND_UNSUPPORTED",
      "Este tipo de pago aún no admite checkout automático.",
      422,
    );
  }

  const allowedStatus = new Set(["pending_proof", "pending"]);
  if (!allowedStatus.has(tx.status as string)) {
    throw new MpError(
      "PSP.INVALID_STATE",
      `No se puede iniciar checkout en estado '${tx.status}'.`,
      409,
    );
  }

  const providerKey = opts.provider ?? defaultPaymentProviderKey();
  const adapter = resolvePaymentProvider(providerKey);
  if (!adapter.isConfigured()) {
    throw new MpError(
      "PSP.NOT_CONFIGURED",
      "El procesador de pagos no está configurado en este entorno.",
      503,
    );
  }

  const origin = await requestOrigin();
  const successUrl = `${origin}/pagos/${opts.transactionId}?psp=success`;
  const cancelUrl = `${origin}/pagos/${opts.transactionId}?psp=cancel`;

  const checkout = await adapter.createCheckout({
    transactionId: opts.transactionId,
    amountCents: tx.amount_cents as number,
    currency: (tx.currency as string) ?? "USD",
    kind: tx.kind as string,
    customerUserId: opts.userId,
    description: `MATCHPOINT · ${tx.kind}`,
    successUrl,
    cancelUrl,
    metadata: buildCheckoutMetadata(opts.transactionId, tx.kind as string),
  });

  const { error: updErr } = await admin
    .from("transactions")
    .update({
      status: "authorized",
      method: "card",
      provider: providerKey,
      provider_payment_id: checkout.providerPaymentId,
    } as never)
    .eq("id", opts.transactionId);

  if (updErr) throw new MpError("PSP.UPDATE_FAILED", updErr.message, 500);

  return {
    checkoutUrl: checkout.checkoutUrl,
    provider: providerKey,
    providerPaymentId: checkout.providerPaymentId,
  };
}
