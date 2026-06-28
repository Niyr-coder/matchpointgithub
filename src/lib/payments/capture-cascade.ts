// Cascada post-capture: registrations, plans, notifs. Compartida por comprobantes
// manuales, aprobación admin y webhooks PSP.
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { notify } from "@/server/notifications/dispatch";
import { activatePendingPlanSubscriptionInternal } from "@/server/plan/activate-plan-subscription";
import { activateClubFeaturingInternal } from "@/server/club-featuring/activate-club-featuring";

type AdminClient = SupabaseClient<Database>;

export type TransactionCaptureRow = {
  id: string;
  kind: string;
  ref_id: string | null;
  club_id: string | null;
  customer_user_id: string | null;
  amount_cents: number | null;
  currency: string | null;
};

function amountLabel(amountCents: number | null, currency: string | null): string {
  if (amountCents == null) return "tu pago";
  return `${currency ?? "USD"} ${(amountCents / 100).toFixed(2)}`;
}

async function isGiveawayPayTransaction(
  supabase: AdminClient,
  kind: string,
  refId: string | null,
): Promise<boolean> {
  if (kind !== "custom" || !refId) return false;
  const { data } = await supabase.from("club_giveaways").select("id").eq("id", refId).maybeSingle();
  return Boolean(data);
}

async function maybeSyncGiveawayPayMechanics(
  supabase: AdminClient,
  tx: Pick<TransactionCaptureRow, "kind" | "ref_id" | "customer_user_id" | "club_id">,
) {
  if (tx.kind !== "custom" || !tx.ref_id || !tx.customer_user_id || !tx.club_id) return;
  const isGiveaway = await isGiveawayPayTransaction(supabase, tx.kind, tx.ref_id);
  if (!isGiveaway) return;
  const { syncActiveGiveawayMechanicsForClubUser } = await import("@/server/actions/giveaways");
  await syncActiveGiveawayMechanicsForClubUser(tx.customer_user_id, tx.club_id);
}

/** Side-effects de negocio tras marcar una transaction como captured. */
export async function runTransactionCaptureCascade(
  supabase: AdminClient,
  tx: TransactionCaptureRow,
  opts?: { notifyCustomer?: boolean },
): Promise<void> {
  const transactionId = tx.id;

  if (tx.kind === "event") {
    await supabase
      .from("event_registrations")
      .update({ status: "registered" } as never)
      .eq("paid_transaction_id", transactionId);
  } else if (tx.kind === "tournament") {
    await supabase
      .from("registrations")
      .update({ status: "accepted" } as never)
      .eq("paid_transaction_id", transactionId);
  } else if (tx.kind === "plan") {
    try {
      const { data: pendingSub } = await supabase
        .from("player_subscriptions")
        .select("id")
        .eq("transaction_id", transactionId)
        .eq("status", "pending")
        .maybeSingle();
      if (pendingSub) {
        await activatePendingPlanSubscriptionInternal(supabase, pendingSub.id as string);
      }
    } catch (err) {
      console.error("[capture-cascade] plan auto-activate failed:", err);
    }
  } else if (tx.kind === "club_featuring") {
    try {
      const { data: pendingSub } = await supabase
        .from("club_featuring_subscriptions")
        .select("id")
        .eq("transaction_id", transactionId)
        .eq("status", "pending")
        .maybeSingle();
      if (pendingSub) {
        await activateClubFeaturingInternal(supabase, pendingSub.id as string);
      }
    } catch (err) {
      console.error("[capture-cascade] club_featuring auto-activate failed:", err);
    }
  } else if (tx.kind === "custom") {
    await maybeSyncGiveawayPayMechanics(supabase, tx);
  }

  if (opts?.notifyCustomer !== false && tx.customer_user_id) {
    await notify({
      userId: tx.customer_user_id,
      role: "user",
      kind: "payment_captured",
      title: "Pago confirmado",
      body: `Confirmamos ${amountLabel(tx.amount_cents, tx.currency)} en MATCHPOINT.`,
      payload: {
        transaction_id: transactionId,
        transaction_kind: tx.kind,
        ref_id: tx.ref_id,
        amount_cents: tx.amount_cents,
        currency: tx.currency,
      },
    });
  }
}
