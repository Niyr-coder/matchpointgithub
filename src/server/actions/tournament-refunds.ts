"use server";

// Reembolsos de torneo para el ORGANIZADOR (partner o club staff).
// La cola vive en refund_requests (mig 20260712000000); el registro final del
// reembolso es transactions.status='refunded' + row en refunds (core
// compartido con el path admin en src/lib/payments/refunds.ts).
import "server-only";

import { z } from "zod";
import { getAdminClient, setAuditActor, auditActorRole } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { UuidSchema } from "@/lib/schemas/common";
import { requireTournamentEditor } from "@/server/actions/tournaments";
import { markTransactionRefundedCore, type RefundCoreResult } from "@/lib/payments/refunds";

export type TournamentRefundRequest = {
  id: string;
  transactionId: string;
  registrationId: string | null;
  status: "pending" | "done" | "dismissed";
  reason: string;
  dueAt: string | null;
  createdAt: string;
  amountCents: number | null;
  currency: string | null;
  method: string | null;
  customerName: string | null;
};

// ── Listar cola de reembolsos del torneo ─────────────────────────────────────

const ListRefundsSchema = z.object({ tournamentId: UuidSchema });

export async function listTournamentRefundRequests(
  input: unknown,
): Promise<ActionResult<{ requests: TournamentRefundRequest[]; pendingCount: number }>> {
  return runAction(ListRefundsSchema, input, async ({ tournamentId }) => {
    await requireTournamentEditor(tournamentId);
    const admin = getAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rowsRaw, error } = await (admin as any)
      .from("refund_requests")
      .select("id, transaction_id, registration_id, status, reason, due_at, created_at")
      .eq("tournament_id", tournamentId)
      .order("status", { ascending: false }) // pending > done > dismissed alfabético inverso
      .order("created_at", { ascending: true });
    if (error) throw new MpError("REFUND.LOAD_FAILED", error.message, 500);

    const rows = (rowsRaw ?? []) as Array<{
      id: string;
      transaction_id: string;
      registration_id: string | null;
      status: "pending" | "done" | "dismissed";
      reason: string;
      due_at: string | null;
      created_at: string;
    }>;

    const txIds = rows.map((r) => r.transaction_id);
    const txById = new Map<
      string,
      { amount_cents: number | null; currency: string | null; method: string | null; customer_name: string | null; customer_user_id: string | null }
    >();
    if (txIds.length > 0) {
      const { data: txs } = await admin
        .from("transactions")
        .select("id, amount_cents, currency, method, customer_name, customer_user_id")
        .in("id", txIds);
      for (const tx of (txs ?? []) as Array<{ id: string; amount_cents: number | null; currency: string | null; method: string | null; customer_name: string | null; customer_user_id: string | null }>) {
        txById.set(tx.id, tx);
      }
    }

    // Nombre del cliente: customer_name de la tx, fallback display_name.
    const missingNameUids = Array.from(
      new Set(
        rows
          .map((r) => txById.get(r.transaction_id))
          .filter((tx) => tx && !tx.customer_name && tx.customer_user_id)
          .map((tx) => tx!.customer_user_id as string),
      ),
    );
    const nameByUid = new Map<string, string>();
    if (missingNameUids.length > 0) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", missingNameUids);
      for (const p of (profs ?? []) as Array<{ id: string; display_name: string | null }>) {
        nameByUid.set(p.id, p.display_name ?? "Jugador");
      }
    }

    const requests: TournamentRefundRequest[] = rows.map((r) => {
      const tx = txById.get(r.transaction_id);
      return {
        id: r.id,
        transactionId: r.transaction_id,
        registrationId: r.registration_id,
        status: r.status,
        reason: r.reason,
        dueAt: r.due_at,
        createdAt: r.created_at,
        amountCents: tx?.amount_cents ?? null,
        currency: tx?.currency ?? null,
        method: tx?.method ?? null,
        customerName:
          tx?.customer_name ??
          (tx?.customer_user_id ? nameByUid.get(tx.customer_user_id) ?? null : null),
      };
    });

    return {
      requests,
      pendingCount: requests.filter((r) => r.status === "pending").length,
    };
  });
}

// ── Marcar reembolsada (organizador) ─────────────────────────────────────────

const MarkRefundedByEditorSchema = z.object({
  tournamentId: UuidSchema,
  transactionId: UuidSchema,
  reason: z.string().min(2, "Motivo requerido").max(500),
  refundReference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  cancelRegistration: z.boolean().default(false),
});

export async function markTournamentTransactionRefunded(
  input: unknown,
): Promise<ActionResult<RefundCoreResult>> {
  return runAction(MarkRefundedByEditorSchema, input, async (data) => {
    const editor = await requireTournamentEditor(data.tournamentId);
    const admin = getAdminClient();

    // La tx debe pertenecer a ESTE torneo — sin esto, un editor podría
    // reembolsar transacciones de otros torneos u otros kinds.
    const { data: tx } = await admin
      .from("transactions")
      .select("id, kind, ref_id")
      .eq("id", data.transactionId)
      .maybeSingle();
    if (!tx || tx.kind !== "tournament" || (tx.ref_id as string | null) !== data.tournamentId) {
      throw new MpError("TX.NOT_FOUND", "La transacción no pertenece a este torneo", 404);
    }

    await setAuditActor(admin, editor.userId, auditActorRole(editor.actorRole));

    return markTransactionRefundedCore(admin, {
      transactionId: data.transactionId,
      reason: data.reason,
      refundReference: data.refundReference,
      cancelRegistration: data.cancelRegistration,
      actorId: editor.userId,
    });
  });
}
