"use server";

// Admin refunds: refunds manuales por transaction.
// MatchPoint NO usa Stripe ni PSP. El admin marca la transaction como
// `refunded` con motivo + referencia de transferencia bancaria/DeUna; un
// humano hace la transferencia real fuera de la app.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

// ── auth helpers ─────────────────────────────────────────────────────────
async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  return user.id;
}

async function requireAdminUserId(): Promise<string> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere admin");
  return userId;
}

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
    const supabase = await getServerClient();

    // 1) Cargar la transaction y validar status.
    const { data: tx, error: loadErr } = await supabase
      .from("transactions")
      .select("id,status,kind,ref_id")
      .eq("id", data.transactionId)
      .maybeSingle();
    if (loadErr) {
      throw new MpError("TX.LOAD_FAILED", loadErr.message, 500);
    }
    if (!tx) {
      throw new MpError("TX.NOT_FOUND", "Transacción no encontrada", 404);
    }
    if (tx.status === "refunded") {
      throw new MpError("TX.ALREADY_REFUNDED", "Ya estaba reembolsada", 409);
    }
    if (tx.status !== "captured") {
      throw new MpError(
        "TX.NOT_REFUNDABLE",
        "Solo se pueden reembolsar transacciones en estado 'captured'",
        409,
      );
    }

    // 2) Marcar como refunded. El trigger tg_audit registra el cambio
    //    en audit_log automáticamente (acción 'transaction.admin_refund'
    //    queda implícita como UPDATE con el diff de las columnas).
    const refundedAtIso = new Date().toISOString();
    const { data: updatedRaw, error: updErr } = await supabase
      .from("transactions")
      .update({
        status: "refunded",
        refund_reason: data.reason.trim(),
        refund_reference: data.refundReference ?? null,
        refunded_at: refundedAtIso,
        refunded_by: adminUserId,
      } as never)
      .eq("id", data.transactionId)
      .eq("status", "captured") // guard contra carreras
      .select("id")
      .maybeSingle();
    if (updErr) {
      throw new MpError("TX.REFUND_FAILED", updErr.message, 500);
    }
    const updated = updatedRaw as { id: string } | null;
    if (!updated) {
      // Alguien cambió el status entre el SELECT y el UPDATE.
      throw new MpError(
        "TX.REFUND_RACE",
        "La transacción cambió de estado. Recarga la página.",
        409,
      );
    }

    // 3) Cancelar la inscripción asociada (opt-out via flag).
    let cancelledRegistration: MarkTransactionRefundedResult["cancelledRegistration"] = null;
    if (data.cancelRegistration) {
      // Evento: event_registrations.paid_transaction_id → status='cancelled'
      const { data: evReg } = await supabase
        .from("event_registrations")
        .select("id,status")
        .eq("paid_transaction_id", data.transactionId)
        .maybeSingle();
      if (evReg && evReg.status !== "cancelled") {
        const { error: evErr } = await supabase
          .from("event_registrations")
          .update({ status: "cancelled" } as never)
          .eq("id", evReg.id);
        if (evErr) {
          throw new MpError(
            "TX.REG_CANCEL_FAILED",
            `Reembolso marcado, pero falló cancelar inscripción de evento: ${evErr.message}`,
            500,
          );
        }
        cancelledRegistration = { kind: "event", id: evReg.id as string };
      }

      // Torneo: registrations.paid_transaction_id → status='withdrawn'
      if (!cancelledRegistration) {
        const { data: trReg } = await supabase
          .from("registrations")
          .select("id,status")
          .eq("paid_transaction_id", data.transactionId)
          .maybeSingle();
        if (trReg && trReg.status !== "withdrawn") {
          const { error: trErr } = await supabase
            .from("registrations")
            .update({ status: "withdrawn" } as never)
            .eq("id", trReg.id);
          if (trErr) {
            throw new MpError(
              "TX.REG_CANCEL_FAILED",
              `Reembolso marcado, pero falló cancelar inscripción de torneo: ${trErr.message}`,
              500,
            );
          }
          cancelledRegistration = { kind: "tournament", id: trReg.id as string };
        }
      }
    }

    return {
      transactionId: updated.id,
      status: "refunded" as const,
      refundedAt: refundedAtIso,
      cancelledRegistration,
    };
  });
}
