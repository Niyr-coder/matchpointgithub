// Procesamiento idempotente de webhooks PSP → transactions.
import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { MpError } from "@/lib/api/errors";
import { runTransactionCaptureCascade } from "@/lib/payments/capture-cascade";
import type { NormalizedWebhookEvent, PaymentProviderKey } from "@/lib/payments/types";
import { resolvePaymentProvider } from "@/lib/payments/registry";

export type WebhookProcessResult =
  | { action: "duplicate" }
  | { action: "ignored"; eventType: string }
  | { action: "processed"; transactionId: string; status: string };

export async function processPaymentWebhook(
  providerKey: PaymentProviderKey,
  req: Request,
  rawBody: string,
): Promise<WebhookProcessResult> {
  const adapter = resolvePaymentProvider(providerKey);
  const event = await adapter.verifyWebhookRequest(req, rawBody);

  const admin = getAdminClient();

  const { data: existing } = await admin
    .from("payment_webhook_events")
    .select("id")
    .eq("provider", event.provider)
    .eq("provider_event_id", event.providerEventId)
    .maybeSingle();

  if (existing) {
    return { action: "duplicate" };
  }

  let transactionId = event.transactionId;

  if (!transactionId && event.providerPaymentId) {
    const { data: txByProvider } = await admin
      .from("transactions")
      .select("id")
      .eq("provider", event.provider)
      .eq("provider_payment_id", event.providerPaymentId)
      .maybeSingle();
    transactionId = (txByProvider?.id as string | undefined) ?? null;
  }

  await admin.from("payment_webhook_events").insert({
    provider: event.provider,
    provider_event_id: event.providerEventId,
    event_type: event.eventType,
    transaction_id: transactionId,
    payload: event.rawPayload as never,
  } as never);

  if (event.status === "ignored") {
    return { action: "ignored", eventType: event.eventType };
  }

  if (!transactionId) {
    console.warn("[psp.webhook] event without transaction mapping", event.providerEventId);
    return { action: "ignored", eventType: event.eventType };
  }

  const { data: tx, error: readErr } = await admin
    .from("transactions")
    .select("id,status,kind,ref_id,club_id,customer_user_id,amount_cents,currency")
    .eq("id", transactionId)
    .maybeSingle();

  if (readErr || !tx) {
    throw new MpError("PSP.TX_NOT_FOUND", "Transacción del webhook no encontrada.", 404);
  }

  if (event.status === "paid") {
    if (tx.status === "captured") {
      return { action: "processed", transactionId, status: "already_captured" };
    }

    const allowedFrom = new Set(["authorized", "pending_proof", "pending"]);
    if (!allowedFrom.has(tx.status as string)) {
      console.warn("[psp.webhook] unexpected tx status for capture", tx.status, transactionId);
    }

    const { error: updErr } = await admin
      .from("transactions")
      .update({
        status: "captured",
        provider: event.provider,
        ...(event.providerPaymentId ? { provider_payment_id: event.providerPaymentId } : {}),
        method: "card",
      } as never)
      .eq("id", transactionId);

    if (updErr) throw new MpError("PSP.UPDATE_FAILED", updErr.message, 500);

    await runTransactionCaptureCascade(admin, {
      id: tx.id as string,
      kind: tx.kind as string,
      ref_id: (tx.ref_id as string | null) ?? null,
      club_id: (tx.club_id as string | null) ?? null,
      customer_user_id: (tx.customer_user_id as string | null) ?? null,
      amount_cents: tx.amount_cents as number | null,
      currency: (tx.currency as string | null) ?? null,
    });

    return { action: "processed", transactionId, status: "captured" };
  }

  if (event.status === "failed") {
    await admin
      .from("transactions")
      .update({ status: "failed" } as never)
      .eq("id", transactionId)
      .in("status", ["authorized", "pending"]);
    return { action: "processed", transactionId, status: "failed" };
  }

  return { action: "ignored", eventType: event.eventType };
}

export async function readWebhookBody(req: Request): Promise<string> {
  return await req.text();
}
