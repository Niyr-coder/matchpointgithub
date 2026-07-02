// Core compartido de reembolsos manuales (MATCHPOINT no usa PSP: la
// transferencia real la hace un humano fuera de la app; aquí solo se marca
// estado + trazabilidad).
//
// - markTransactionRefundedCore: lógica completa de "marcar reembolsada"
//   (validar, update tx, row en refunds, cancelar inscripción, cerrar la
//   refund_request pendiente, notif al cliente). La usan el action admin
//   (admin-refunds.ts) y el del organizador (tournament-refunds.ts) — la
//   autorización y setAuditActor son responsabilidad del caller.
// - createTournamentRefundRequest: encola un reembolso pendiente (dedup por
//   unique(transaction_id)) con vencimiento según refund_window_days.
// - notifyRefundRequested: aviso al staff del organizador (partner o club).
import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { MpError } from "@/lib/api/errors";
import { notify } from "@/server/notifications/dispatch";
import { notifyClubStaff, notifyPartnerOrgStaff } from "@/lib/notifications/helpers";
import { getRefundWindowDays } from "@/server/queries/platform-config";

type AdminClient = ReturnType<typeof getAdminClient>;

export type RefundCoreResult = {
  transactionId: string;
  status: "refunded";
  refundedAt: string;
  cancelledRegistration:
    | { kind: "event"; id: string }
    | { kind: "tournament"; id: string }
    | null;
};

function amountLabel(amountCents: number | null, currency: string | null): string {
  if (amountCents == null) return "tu pago";
  return `${currency ?? "USD"} ${(amountCents / 100).toFixed(2)}`;
}

export async function markTransactionRefundedCore(
  admin: AdminClient,
  opts: {
    transactionId: string;
    reason: string;
    refundReference?: string;
    cancelRegistration: boolean;
    actorId: string;
  },
): Promise<RefundCoreResult> {
  // 1) Cargar la transaction y validar status.
  const { data: tx, error: loadErr } = await admin
    .from("transactions")
    .select("id,status,kind,ref_id,customer_user_id,amount_cents,currency")
    .eq("id", opts.transactionId)
    .maybeSingle();
  if (loadErr) throw new MpError("TX.LOAD_FAILED", loadErr.message, 500);
  if (!tx) throw new MpError("TX.NOT_FOUND", "Transacción no encontrada", 404);
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

  const { data: existingRefund, error: existingRefundErr } = await admin
    .from("refunds")
    .select("id")
    .eq("transaction_id", opts.transactionId)
    .limit(1)
    .maybeSingle();
  if (existingRefundErr) {
    throw new MpError("REFUND.LOAD_FAILED", existingRefundErr.message, 500);
  }
  if (existingRefund) {
    throw new MpError(
      "TX.ALREADY_REFUNDED",
      "Ya existe un reembolso registrado para esta transacción",
      409,
    );
  }

  // 2) Marcar como refunded (guard contra carreras vía .eq status).
  const refundedAtIso = new Date().toISOString();
  const { data: updatedRaw, error: updErr } = await admin
    .from("transactions")
    .update({
      status: "refunded",
      refund_reason: opts.reason.trim(),
      refund_reference: opts.refundReference ?? null,
      refunded_at: refundedAtIso,
      refunded_by: opts.actorId,
    } as never)
    .eq("id", opts.transactionId)
    .eq("status", "captured")
    .select("id")
    .maybeSingle();
  if (updErr) throw new MpError("TX.REFUND_FAILED", updErr.message, 500);
  const updated = updatedRaw as { id: string } | null;
  if (!updated) {
    throw new MpError(
      "TX.REFUND_RACE",
      "La transacción cambió de estado. Recarga la página.",
      409,
    );
  }

  // 3) Trazabilidad normalizada en refunds. La referencia bancaria/DeUna
  //    queda en transactions.refund_reference (refunds no tiene esa columna).
  const { error: refundErr } = await admin.from("refunds").insert({
    transaction_id: opts.transactionId,
    amount_cents: tx.amount_cents,
    reason: opts.reason.trim(),
    created_by: opts.actorId,
  } as never);
  if (refundErr) throw new MpError("REFUND.CREATE_FAILED", refundErr.message, 500);

  // 4) Cancelar la inscripción asociada (opt-out via flag).
  let cancelledRegistration: RefundCoreResult["cancelledRegistration"] = null;
  if (opts.cancelRegistration) {
    const { data: evReg } = await admin
      .from("event_registrations")
      .select("id,status")
      .eq("paid_transaction_id", opts.transactionId)
      .maybeSingle();
    if (evReg && evReg.status !== "cancelled") {
      const { error: evErr } = await admin
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

    if (!cancelledRegistration) {
      const { data: trReg } = await admin
        .from("registrations")
        .select("id,status")
        .eq("paid_transaction_id", opts.transactionId)
        .maybeSingle();
      if (trReg && trReg.status !== "withdrawn") {
        const { error: trErr } = await admin
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

  // 5) Cerrar la refund_request pendiente si existía (best-effort).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rrErr } = await (admin as any)
    .from("refund_requests")
    .update({ status: "done", resolved_at: refundedAtIso, resolved_by: opts.actorId })
    .eq("transaction_id", opts.transactionId)
    .eq("status", "pending");
  if (rrErr) {
    console.error("[refunds] cerrar refund_request falló:", rrErr.message);
  }

  // 6) Notif al cliente.
  const customerId = tx.customer_user_id as string | null;
  if (customerId) {
    await notify({
      userId: customerId,
      role: "user",
      kind: "refund_completed",
      title: "Reembolso registrado",
      body: `Registramos el reembolso de ${amountLabel(tx.amount_cents as number | null, (tx.currency as string | null) ?? null)}. La devolución se completa fuera de la app según la referencia registrada.`,
      payload: {
        transaction_id: opts.transactionId,
        transaction_kind: tx.kind,
        ref_id: tx.ref_id,
        amount_cents: tx.amount_cents,
        currency: tx.currency,
        reason: opts.reason.trim(),
        refund_reference: opts.refundReference ?? null,
        cancelled_registration: cancelledRegistration,
      },
    });
  }

  return {
    transactionId: updated.id,
    status: "refunded" as const,
    refundedAt: refundedAtIso,
    cancelledRegistration,
  };
}

/**
 * Encola un reembolso pendiente. Dedup por unique(transaction_id): si ya hay
 * request para esa tx (de cualquier status), no crea otra. Best-effort: nunca
 * lanza — la mutación principal (cancelación) no debe fallar por esto.
 */
export async function createTournamentRefundRequest(
  admin: AdminClient,
  opts: {
    transactionId: string;
    registrationId: string | null;
    tournamentId: string;
    requestedBy: string | null;
    reason: string;
  },
): Promise<boolean> {
  try {
    const windowDays = await getRefundWindowDays();
    const dueAt = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("refund_requests")
      .upsert(
        {
          transaction_id: opts.transactionId,
          registration_id: opts.registrationId,
          tournament_id: opts.tournamentId,
          requested_by: opts.requestedBy,
          reason: opts.reason,
          status: "pending",
          due_at: dueAt,
        },
        { onConflict: "transaction_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) {
      console.error("[refunds] crear refund_request falló:", error.message);
      return false;
    }
    return ((data as unknown[]) ?? []).length > 0;
  } catch (err) {
    console.error("[refunds] crear refund_request falló:", err);
    return false;
  }
}

/** Aviso al staff del organizador (partner o club) de reembolsos en cola. */
export async function notifyRefundRequested(
  admin: AdminClient,
  opts: { tournamentId: string; count: number; totalCents: number | null; currency: string | null },
): Promise<void> {
  try {
    const { data: t } = await admin
      .from("tournaments")
      .select("id,name,slug,partner_id,club_id")
      .eq("id", opts.tournamentId)
      .maybeSingle();
    if (!t) return;

    const many = opts.count > 1;
    const amount =
      opts.totalCents != null
        ? ` por ${amountLabel(opts.totalCents, opts.currency)}`
        : "";
    const notifArgs = {
      kind: "refund_requested",
      title: many ? `${opts.count} reembolsos pendientes` : "Reembolso pendiente",
      body: many
        ? `Hay ${opts.count} reembolsos${amount} por procesar en ${t.name as string}.`
        : `Hay un reembolso${amount} por procesar en ${t.name as string}.`,
      payload: {
        tournament_id: opts.tournamentId,
        tournament_slug: t.slug,
        tournament_name: t.name,
        count: opts.count,
        total_cents: opts.totalCents,
        currency: opts.currency,
      },
    };
    const partnerId = t.partner_id as string | null;
    const clubId = t.club_id as string | null;
    if (partnerId) {
      await notifyPartnerOrgStaff({ partnerId, ...notifArgs });
    } else if (clubId) {
      await notifyClubStaff({ clubId, ...notifArgs });
    }
  } catch (err) {
    console.error("[refunds] notifyRefundRequested falló:", err);
  }
}
