"use server";

// Admin refunds: refunds manuales por transaction.
// MATCHPOINT NO usa Stripe ni PSP. El admin marca la transaction como
// `refunded` con motivo + referencia de transferencia bancaria/DeUna; un
// humano hace la transferencia real fuera de la app.
import "server-only";

import { z } from "zod";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { requireAdminUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { markTransactionRefundedCore } from "@/lib/payments/refunds";

// ── markTransactionRefundedAdmin ─────────────────────────────────────────
const MarkRefundedSchema = z.object({
  transactionId: UuidSchema,
  reason: z.string().min(2, "Motivo requerido").max(500),
  refundReference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  cancelRegistration: z.boolean().default(true),
});

export type MarkTransactionRefundedResult = {
  transactionId: string;
  status: "refunded";
  refundedAt: string;
  cancelledRegistration:
    | { kind: "event"; id: string }
    | { kind: "tournament"; id: string }
    | null;
};

export async function markTransactionRefundedAdmin(
  input: unknown,
): Promise<ActionResult<MarkTransactionRefundedResult>> {
  return runAction(MarkRefundedSchema, input, async (data) => {
    const adminUserId = await requireAdminUserId();
    const admin = getAdminClient();
    // `setAuditActor` preserva el actor admin en audit_log aunque el core
    // use service role para cruzar RLS.
    await setAuditActor(admin, adminUserId, "admin");

    return markTransactionRefundedCore(admin, {
      transactionId: data.transactionId,
      reason: data.reason,
      refundReference: data.refundReference,
      cancelRegistration: data.cancelRegistration,
      actorId: adminUserId,
    });
  });
}
