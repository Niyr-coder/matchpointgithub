"use server";

// Flujo de comprobantes de pago (transferencia bancaria o DeUna).
// MATCHPOINT no usa PSP. El usuario hace la transferencia fuera de la app,
// sube el comprobante a Storage (bucket `payment_proofs`). Estados:
//
//   pending_proof     → esperando que el usuario suba comprobante
//   proof_submitted   → comprobante subido, esperando revisión admin
//   captured          → cobrado
//
// IMPORTANTE — política de auto-captura para inscripciones de torneo
// (kind='tournament'): cuando el jugador sube comprobante, la transacción
// pasa directo a `captured` y la registration a `accepted`, sin revisión.
// Decisión del producto para minimizar fricción. Si aparecen comprobantes
// falsos, queda audit log en `audit_log` y se puede revertir manualmente.
// Otros kinds (plan, evento, club_featuring) siguen con revisión admin.
//
// Rechazo (kinds con revisión): el admin pasa la transacción de vuelta a
// `pending_proof` con un motivo en `proof_rejection_reason`.
//
// Audit log: las tablas críticas (incluida `transactions`) tienen trigger
// `tg_audit` aplicado en 099_audit_triggers.sql, por lo que cada UPDATE
// se loguea automáticamente en `audit_log`. No hace falta logging manual.

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { approvePlanSubscriptionAdmin } from "@/server/actions/player-subscriptions";
import { approveClubFeaturingAdmin } from "@/server/actions/club-featuring";

// ── helpers de auth ─────────────────────────────────────────────────────
async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Debes iniciar sesión");
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
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere rol admin");
  return userId;
}

// ── tipo de salida común ────────────────────────────────────────────────
export type PaymentProofResult = {
  transactionId: string;
  status: string;
  proofUrl: string | null;
  proofSubmittedAt: string | null;
  proofReviewedAt: string | null;
  proofRejectionReason: string | null;
};

function mapResult(row: Record<string, unknown>): PaymentProofResult {
  return {
    transactionId: row.id as string,
    status: row.status as string,
    proofUrl: (row.proof_url as string | null) ?? null,
    proofSubmittedAt: (row.proof_submitted_at as string | null) ?? null,
    proofReviewedAt: (row.proof_reviewed_at as string | null) ?? null,
    proofRejectionReason: (row.proof_rejection_reason as string | null) ?? null,
  };
}

// ── submitPaymentProof (user) ───────────────────────────────────────────
// El usuario marca su transacción como "comprobante enviado". El archivo ya
// fue subido a Storage (bucket `payment_proofs`) desde el cliente; aquí solo
// guardamos el path/URL en la transacción y avanzamos el estado.
const SubmitProofSchema = z.object({
  transactionId: UuidSchema,
  proofUrl: z.string().min(1).max(500),
});

export async function submitPaymentProof(
  input: unknown,
): Promise<ActionResult<PaymentProofResult>> {
  return runAction(SubmitProofSchema, input, async ({ transactionId, proofUrl }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: tx, error: readErr } = await supabase
      .from("transactions")
      .select("id,customer_user_id,status,kind")
      .eq("id", transactionId)
      .maybeSingle();
    if (readErr) throw new MpError("PAYMENT_PROOF.DB_ERROR", readErr.message, 500);
    if (!tx) throw new MpError("PAYMENT_PROOF.NOT_FOUND", "Transacción no encontrada", 404);
    if (tx.customer_user_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Esta transacción no es tuya");
    }
    if (tx.status !== "pending_proof") {
      throw new MpError(
        "PAYMENT_PROOF.INVALID_STATE",
        `No se puede subir comprobante en estado '${tx.status}'`,
        409,
      );
    }

    // Inscripciones de torneos: auto-capturamos al subir comprobante (decisión
    // del producto — sin revisión de admin). Otros kinds (plan, evento,
    // club_featuring) siguen pasando por revisión manual.
    const autoCapture = tx.kind === "tournament";
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      proof_url: proofUrl,
      proof_submitted_at: nowIso,
      proof_rejection_reason: null,
      status: autoCapture ? "captured" : "proof_submitted",
    };
    if (autoCapture) {
      updatePayload.proof_reviewed_at = nowIso;
      updatePayload.proof_reviewed_by = null;
    }

    // Auth ya validada arriba (customer_user_id === userId). RLS de
    // transactions no expone UPDATE al customer, así que usamos service role
    // para esta mutación — la validación de identidad ya pasó.
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("transactions")
      .update(updatePayload as never)
      .eq("id", transactionId)
      .select("id,status,proof_url,proof_submitted_at,proof_reviewed_at,proof_rejection_reason")
      .single();
    if (error) throw new MpError("PAYMENT_PROOF.UPDATE_FAILED", error.message, 500);

    if (autoCapture) {
      // Marcar la inscripción del torneo como aceptada. Reusamos el admin
      // client ya creado arriba.
      await admin
        .from("registrations")
        .update({ status: "accepted" } as never)
        .eq("paid_transaction_id", transactionId);
    }

    return mapResult(data);
  });
}

// ── approvePaymentProofAdmin (admin) ────────────────────────────────────
// Aprueba el comprobante: status='captured'. Si la transacción está ligada a
// una inscripción (event_registrations o registrations vía paid_transaction_id),
// se actualiza esa inscripción a un estado "registered"/"accepted".
const ApproveSchema = z.object({
  transactionId: UuidSchema,
  note: z.string().max(500).optional(),
});

export async function approvePaymentProofAdmin(
  input: unknown,
): Promise<ActionResult<PaymentProofResult>> {
  return runAction(ApproveSchema, input, async ({ transactionId }) => {
    const reviewerId = await requireAdminUserId();
    // Admin no tiene policy de UPDATE en transactions (solo staff de club).
    // Después de validar admin via requireAdminUserId, usamos service role.
    const supabase = getAdminClient();
    await setAuditActor(supabase, reviewerId, "admin");

    const { data: tx, error: readErr } = await supabase
      .from("transactions")
      .select("id,status,kind,ref_id")
      .eq("id", transactionId)
      .maybeSingle();
    if (readErr) throw new MpError("PAYMENT_PROOF.DB_ERROR", readErr.message, 500);
    if (!tx) throw new MpError("PAYMENT_PROOF.NOT_FOUND", "Transacción no encontrada", 404);
    if (tx.status !== "proof_submitted") {
      throw new MpError(
        "PAYMENT_PROOF.INVALID_STATE",
        `Solo se puede aprobar desde 'proof_submitted' (estado actual: '${tx.status}')`,
        409,
      );
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("transactions")
      .update({
        status: "captured",
        proof_reviewed_by: reviewerId,
        proof_reviewed_at: nowIso,
        proof_rejection_reason: null,
      } as never)
      .eq("id", transactionId)
      .select("id,status,proof_url,proof_submitted_at,proof_reviewed_at,proof_rejection_reason")
      .single();
    if (error) throw new MpError("PAYMENT_PROOF.UPDATE_FAILED", error.message, 500);

    // Si la transacción está ligada a una inscripción, marcar como aceptada.
    // Buscamos por paid_transaction_id en event_registrations y registrations.
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
      // Auto-activar la subscription de plan asociada a esta transaction.
      // Si algo falla, logueamos pero no abortamos: el comprobante ya quedó
      // aprobado y el admin puede activar la subscription manualmente.
      try {
        const { data: pendingSub, error: subReadErr } = await supabase
          .from("player_subscriptions")
          .select("id")
          .eq("transaction_id", transactionId)
          .eq("status", "pending")
          .maybeSingle();
        if (subReadErr) {
          console.error(
            "[approvePaymentProof] plan auto-activate failed:",
            subReadErr,
          );
        } else if (!pendingSub) {
          console.warn(
            `[approvePaymentProof] no pending player_subscription for transaction ${transactionId}; skipping auto-activate`,
          );
        } else {
          const activateResult = await approvePlanSubscriptionAdmin({
            subscriptionId: pendingSub.id as string,
          });
          if (!activateResult.ok) {
            console.error(
              "[approvePaymentProof] plan auto-activate failed:",
              activateResult.error,
            );
          }
        }
      } catch (err) {
        console.error("[approvePaymentProof] plan auto-activate failed:", err);
      }
    } else if (tx.kind === "club_featuring") {
      // Auto-activar la subscription de featuring asociada a esta
      // transaction. Mismo patrón que 'plan': si algo falla, logueamos
      // pero no abortamos — el comprobante ya quedó aprobado y el admin
      // puede activar el featuring manualmente desde el panel.
      try {
        const { data: pendingSub, error: subReadErr } = await supabase
          .from("club_featuring_subscriptions")
          .select("id")
          .eq("transaction_id", transactionId)
          .eq("status", "pending")
          .maybeSingle();
        if (subReadErr) {
          console.error(
            "[approvePaymentProof] club_featuring auto-activate failed:",
            subReadErr,
          );
        } else if (!pendingSub) {
          console.warn(
            `[approvePaymentProof] no pending club_featuring_subscription for transaction ${transactionId}; skipping auto-activate`,
          );
        } else {
          const activateResult = await approveClubFeaturingAdmin({
            subscriptionId: pendingSub.id as string,
          });
          if (!activateResult.ok) {
            console.error(
              "[approvePaymentProof] club_featuring auto-activate failed:",
              activateResult.error,
            );
          }
        }
      } catch (err) {
        console.error(
          "[approvePaymentProof] club_featuring auto-activate failed:",
          err,
        );
      }
    }

    return mapResult(data);
  });
}

// ── rejectPaymentProofAdmin (admin) ─────────────────────────────────────
// Rechazo "blando": vuelve a `pending_proof` para que el usuario re-suba.
// Guarda el motivo en `proof_rejection_reason`.
const RejectSchema = z.object({
  transactionId: UuidSchema,
  reason: z.string().min(2).max(500),
});

export async function rejectPaymentProofAdmin(
  input: unknown,
): Promise<ActionResult<PaymentProofResult>> {
  return runAction(RejectSchema, input, async ({ transactionId, reason }) => {
    const reviewerId = await requireAdminUserId();
    // Mismo motivo que approve: admin no tiene policy de UPDATE en
    // transactions, después de validar admin usamos service role.
    const supabase = getAdminClient();
    await setAuditActor(supabase, reviewerId, "admin");

    const { data: tx, error: readErr } = await supabase
      .from("transactions")
      .select("id,status,customer_user_id,kind,ref_id")
      .eq("id", transactionId)
      .maybeSingle();
    if (readErr) throw new MpError("PAYMENT_PROOF.DB_ERROR", readErr.message, 500);
    if (!tx) throw new MpError("PAYMENT_PROOF.NOT_FOUND", "Transacción no encontrada", 404);
    if (tx.status !== "proof_submitted") {
      throw new MpError(
        "PAYMENT_PROOF.INVALID_STATE",
        `Solo se puede rechazar desde 'proof_submitted' (estado actual: '${tx.status}')`,
        409,
      );
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("transactions")
      .update({
        status: "pending_proof",
        proof_reviewed_by: reviewerId,
        proof_reviewed_at: nowIso,
        proof_rejection_reason: reason,
        // Limpiamos el proof_url para forzar nueva subida.
        proof_url: null,
        proof_submitted_at: null,
      } as never)
      .eq("id", transactionId)
      .select("id,status,proof_url,proof_submitted_at,proof_reviewed_at,proof_rejection_reason")
      .single();
    if (error) throw new MpError("PAYMENT_PROOF.UPDATE_FAILED", error.message, 500);

    // Notificar al customer con la razón del rechazo. Best-effort: si falla
    // la cola, la mutación principal sigue siendo válida.
    const customerId = tx.customer_user_id as string | null;
    if (customerId) {
      const { error: jobErr } = await supabase.from("notification_jobs").insert({
        user_id: customerId,
        role: "user",
        kind: "payment_proof_rejected",
        channel: "inapp",
        payload: {
          transaction_id: transactionId,
          transaction_kind: tx.kind,
          ref_id: tx.ref_id,
          rejection_reason: reason,
        },
        status: "pending",
      } as never);
      if (jobErr) {
        console.error(
          "[rejectPaymentProofAdmin] enqueue rejection notification failed:",
          jobErr.message,
        );
      }
    }

    return mapResult(data);
  });
}

// ── listPendingProofsAdmin (admin) ──────────────────────────────────────
// Listado de comprobantes esperando revisión. Devuelve datos hidratados
// (cliente, evento/torneo, monto, signed URL del comprobante).
export type PendingProofRow = {
  transactionId: string;
  amountCents: number;
  currency: string | null;
  customerName: string;
  customerUserId: string | null;
  kind: string;
  refLabel: string | null;
  proofUrl: string | null;
  proofSignedUrl: string | null;
  proofSubmittedAt: string | null;
  createdAt: string;
};

const SIGNED_URL_TTL = 60 * 10; // 10 min

export async function listPendingProofsAdmin(): Promise<
  ActionResult<PendingProofRow[]>
> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    // Admin SELECT en transactions tampoco está cubierto por RLS, requiere
    // service role tras validar el rol.
    const supabase = getAdminClient();

    const { data: txs, error } = await supabase
      .from("transactions")
      .select(
        "id,amount_cents,currency,kind,ref_id,customer_user_id,customer_name,proof_url,proof_submitted_at,created_at",
      )
      .eq("status", "proof_submitted")
      .order("proof_submitted_at", { ascending: true })
      .limit(100);
    if (error) throw new MpError("PAYMENT_PROOF.DB_ERROR", error.message, 500);
    const rows = txs ?? [];

    // Hidratar nombre del usuario, label del evento/torneo y signed URL.
    const userIds = Array.from(
      new Set(rows.map((r) => r.customer_user_id).filter((v): v is string => !!v)),
    );
    const eventIds = rows
      .filter((r) => r.kind === "event" && r.ref_id)
      .map((r) => r.ref_id as string);
    const tournamentIds = rows
      .filter((r) => r.kind === "tournament" && r.ref_id)
      .map((r) => r.ref_id as string);

    const [{ data: profiles }, { data: events }, { data: tournaments }] =
      await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id,display_name").in("id", userIds)
          : Promise.resolve({ data: [] as Array<{ id: string; display_name: string }> }),
        eventIds.length
          ? supabase.from("events").select("id,name").in("id", eventIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
        tournamentIds.length
          ? supabase.from("tournaments").select("id,name").in("id", tournamentIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      ]);

    const profileMap = new Map<string, string>();
    for (const p of profiles ?? []) profileMap.set(p.id as string, p.display_name as string);
    const eventMap = new Map<string, string>();
    for (const e of events ?? []) eventMap.set(e.id as string, e.name as string);
    const tournamentMap = new Map<string, string>();
    for (const t of tournaments ?? []) tournamentMap.set(t.id as string, t.name as string);

    const result: PendingProofRow[] = await Promise.all(
      rows.map(async (r) => {
        let signed: string | null = null;
        const proofUrl = (r.proof_url as string | null) ?? null;
        if (proofUrl) {
          const { data: s } = await supabase.storage
            .from("payment_proofs")
            .createSignedUrl(proofUrl, SIGNED_URL_TTL);
          signed = s?.signedUrl ?? null;
        }
        const userName = r.customer_user_id
          ? profileMap.get(r.customer_user_id as string) ?? null
          : null;
        const refLabel =
          r.kind === "event"
            ? eventMap.get((r.ref_id as string | null) ?? "") ?? null
            : r.kind === "tournament"
              ? tournamentMap.get((r.ref_id as string | null) ?? "") ?? null
              : null;
        return {
          transactionId: r.id as string,
          amountCents: r.amount_cents as number,
          currency: (r.currency as string | null) ?? null,
          customerName: userName ?? (r.customer_name as string | null) ?? "Sin nombre",
          customerUserId: (r.customer_user_id as string | null) ?? null,
          kind: r.kind as string,
          refLabel,
          proofUrl,
          proofSignedUrl: signed,
          proofSubmittedAt: (r.proof_submitted_at as string | null) ?? null,
          createdAt: r.created_at as string,
        };
      }),
    );

    return result;
  });
}

// ── getPaymentProofForUser (user) ───────────────────────────────────────
// Devuelve el detalle de una transacción que el usuario tiene asignada,
// incluyendo signed URL si ya hay comprobante subido. Usada por la página
// de upload.
export type UserPaymentProofView = {
  transactionId: string;
  status: string;
  amountCents: number;
  currency: string | null;
  kind: string;
  refLabel: string | null;
  proofUrl: string | null;
  proofSignedUrl: string | null;
  proofSubmittedAt: string | null;
  proofReviewedAt: string | null;
  proofRejectionReason: string | null;
  createdAt: string;
};

export async function getPaymentProofForUser(
  input: unknown,
): Promise<ActionResult<UserPaymentProofView>> {
  return runAction(z.object({ transactionId: UuidSchema }), input, async ({ transactionId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: tx, error } = await supabase
      .from("transactions")
      .select(
        "id,status,amount_cents,currency,kind,ref_id,customer_user_id,proof_url,proof_submitted_at,proof_reviewed_at,proof_rejection_reason,created_at",
      )
      .eq("id", transactionId)
      .maybeSingle();
    if (error) throw new MpError("PAYMENT_PROOF.DB_ERROR", error.message, 500);
    if (!tx) throw new MpError("PAYMENT_PROOF.NOT_FOUND", "Transacción no encontrada", 404);
    if (tx.customer_user_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Esta transacción no es tuya");
    }

    let refLabel: string | null = null;
    if (tx.ref_id) {
      if (tx.kind === "event") {
        const { data: ev } = await supabase
          .from("events")
          .select("name")
          .eq("id", tx.ref_id as string)
          .maybeSingle();
        refLabel = (ev?.name as string | null) ?? null;
      } else if (tx.kind === "tournament") {
        const { data: tn } = await supabase
          .from("tournaments")
          .select("name")
          .eq("id", tx.ref_id as string)
          .maybeSingle();
        refLabel = (tn?.name as string | null) ?? null;
      }
    }

    let signed: string | null = null;
    const proofUrl = (tx.proof_url as string | null) ?? null;
    if (proofUrl) {
      const { data: s } = await supabase.storage
        .from("payment_proofs")
        .createSignedUrl(proofUrl, SIGNED_URL_TTL);
      signed = s?.signedUrl ?? null;
    }

    return {
      transactionId: tx.id as string,
      status: tx.status as string,
      amountCents: tx.amount_cents as number,
      currency: (tx.currency as string | null) ?? null,
      kind: tx.kind as string,
      refLabel,
      proofUrl,
      proofSignedUrl: signed,
      proofSubmittedAt: (tx.proof_submitted_at as string | null) ?? null,
      proofReviewedAt: (tx.proof_reviewed_at as string | null) ?? null,
      proofRejectionReason: (tx.proof_rejection_reason as string | null) ?? null,
      createdAt: tx.created_at as string,
    };
  });
}
