"use server";

// Acciones admin sobre event_registrations: remover, marcar asistencia y
// transferir cupo. Solo admins (role_assignments.role = 'admin').
//
// Notas de schema:
// - event_registrations.status acepta ['registered','cancelled','attended','no_show']
//   (CHECK constraint). No hay columna booleana `attended`; usamos status.
// - Unique (event_id, user_id): el transfer verifica que el destino no esté
//   ya inscrito al mismo evento.
// - Si la registration tiene paid_transaction_id NO se marca refund aquí;
//   se deja nota en audit_log para el agente C (refunds).
//
// El audit trigger tg_audit ya emite un UPDATE genérico; adicionalmente
// llamamos a fn_admin_audit_log (RPC SECURITY DEFINER en migration 042)
// para dejar el `action` semántico (ej. 'event_registration.admin_remove').

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

async function requireAdminUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere rol admin");
  return user.id;
}

async function writeAuditLog(params: {
  entity: string;
  entityId: string;
  action: string;
  diff?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await getServerClient();
  const { error } = await supabase.rpc("fn_admin_audit_log", {
    p_entity: params.entity,
    p_entity_id: params.entityId,
    p_action: params.action,
    p_diff: (params.diff ?? {}) as never,
  });
  // No bloquear la mutación si el audit falla; solo loguear.
  if (error) console.error("[admin-event-registrations] audit log failed", error);
}

// ── removeEventRegistrationAdmin ───────────────────────────────────────
const RemoveSchema = z.object({
  registrationId: UuidSchema,
  reason: z.string().min(2).max(500).optional(),
});

export type EventRegistrationRow = {
  id: string;
  eventId: string;
  userId: string;
  status: string;
  paidTransactionId: string | null;
  createdAt: string;
};

function mapReg(row: Record<string, unknown>): EventRegistrationRow {
  return {
    id: row.id as string,
    eventId: row.event_id as string,
    userId: row.user_id as string,
    status: row.status as string,
    paidTransactionId: (row.paid_transaction_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function removeEventRegistrationAdmin(
  input: unknown,
): Promise<ActionResult<EventRegistrationRow>> {
  return runAction(RemoveSchema, input, async ({ registrationId, reason }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id,event_id,user_id,status,paid_transaction_id,created_at")
      .eq("id", registrationId)
      .single();
    if (!existing) {
      throw new MpError("EVENT_REG.NOT_FOUND", "Inscripción no encontrada", 404);
    }
    if (existing.status === "cancelled") {
      throw new MpError("EVENT_REG.ALREADY_CANCELLED", "Ya estaba cancelada", 409);
    }

    const { data: updated, error } = await supabase
      .from("event_registrations")
      .update({ status: "cancelled" } as never)
      .eq("id", registrationId)
      .select("id,event_id,user_id,status,paid_transaction_id,created_at")
      .single();
    if (error) {
      throw new MpError("EVENT_REG.REMOVE_FAILED", error.message, 500);
    }

    await writeAuditLog({
      entity: "event_registrations",
      entityId: registrationId,
      action: "event_registration.admin_remove",
      diff: {
        reason: reason ?? null,
        previousStatus: existing.status,
        // Si tenía pago, dejamos nota para el agente C (refunds).
        // No marcamos refund aquí.
        paidTransactionId: existing.paid_transaction_id ?? null,
        refundPending: existing.paid_transaction_id != null,
      },
    });

    return mapReg(updated);
  });
}

// ── markEventAttendanceAdmin ───────────────────────────────────────────
const AttendanceSchema = z.object({
  registrationId: UuidSchema,
  attended: z.boolean(),
});

export async function markEventAttendanceAdmin(
  input: unknown,
): Promise<ActionResult<EventRegistrationRow>> {
  return runAction(AttendanceSchema, input, async ({ registrationId, attended }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id,event_id,user_id,status,paid_transaction_id,created_at")
      .eq("id", registrationId)
      .single();
    if (!existing) {
      throw new MpError("EVENT_REG.NOT_FOUND", "Inscripción no encontrada", 404);
    }
    if (existing.status === "cancelled") {
      throw new MpError(
        "EVENT_REG.CANCELLED",
        "La inscripción está cancelada; no se puede marcar asistencia",
        409,
      );
    }

    const nextStatus = attended ? "attended" : "registered";
    const { data: updated, error } = await supabase
      .from("event_registrations")
      .update({ status: nextStatus } as never)
      .eq("id", registrationId)
      .select("id,event_id,user_id,status,paid_transaction_id,created_at")
      .single();
    if (error) {
      throw new MpError("EVENT_REG.ATTENDANCE_FAILED", error.message, 500);
    }

    await writeAuditLog({
      entity: "event_registrations",
      entityId: registrationId,
      action: "event_registration.admin_mark_attendance",
      diff: {
        attended,
        previousStatus: existing.status,
        newStatus: nextStatus,
      },
    });

    return mapReg(updated);
  });
}

// ── markEventNoShowAdmin ───────────────────────────────────────────────
// Marca la inscripción como 'no_show' (el jugador no se presentó al evento).
// Si la transacción ligada no está cobrada todavía (pending / pending_proof /
// proof_submitted), también se marca como 'failed' porque ya no hay nada que
// cobrar — el cupo se perdió. Si ya estaba 'captured' no se toca el dinero
// (pagó pero no asistió: el organizador decide qué hacer).
const NoShowSchema = z.object({
  registrationId: UuidSchema,
  reason: z.string().max(500).optional(),
});

export async function markEventNoShowAdmin(
  input: unknown,
): Promise<ActionResult<EventRegistrationRow>> {
  return runAction(NoShowSchema, input, async ({ registrationId, reason }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id,event_id,user_id,status,paid_transaction_id,created_at")
      .eq("id", registrationId)
      .single();
    if (!existing) {
      throw new MpError("EVENT_REG.NOT_FOUND", "Inscripción no encontrada", 404);
    }
    if (existing.status === "cancelled") {
      throw new MpError(
        "EVENT_REG.CANCELLED",
        "La inscripción está cancelada; no aplica no-show",
        409,
      );
    }

    const { data: updated, error } = await supabase
      .from("event_registrations")
      .update({ status: "no_show" } as never)
      .eq("id", registrationId)
      .select("id,event_id,user_id,status,paid_transaction_id,created_at")
      .single();
    if (error) {
      throw new MpError("EVENT_REG.NO_SHOW_FAILED", error.message, 500);
    }

    // Si hay tx ligada y no está captured/refunded, marcarla failed.
    let txMarkedFailed = false;
    const txId = existing.paid_transaction_id as string | null;
    if (txId) {
      const { data: tx } = await supabase
        .from("transactions")
        .select("status")
        .eq("id", txId)
        .maybeSingle();
      if (tx && tx.status !== "captured" && tx.status !== "refunded" && tx.status !== "failed") {
        await supabase
          .from("transactions")
          .update({ status: "failed" } as never)
          .eq("id", txId);
        txMarkedFailed = true;
      }
    }

    await writeAuditLog({
      entity: "event_registrations",
      entityId: registrationId,
      action: "event_registration.admin_mark_no_show",
      diff: {
        previousStatus: existing.status,
        reason: reason ?? null,
        linkedTransactionId: txId,
        txMarkedFailed,
      },
    });

    return mapReg(updated);
  });
}

// ── transferEventSlotAdmin ─────────────────────────────────────────────
const TransferSchema = z.object({
  registrationId: UuidSchema,
  toUserId: UuidSchema,
});

export async function transferEventSlotAdmin(
  input: unknown,
): Promise<ActionResult<EventRegistrationRow>> {
  return runAction(TransferSchema, input, async ({ registrationId, toUserId }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id,event_id,user_id,status,paid_transaction_id,created_at")
      .eq("id", registrationId)
      .single();
    if (!existing) {
      throw new MpError("EVENT_REG.NOT_FOUND", "Inscripción no encontrada", 404);
    }
    if (existing.status === "cancelled") {
      throw new MpError(
        "EVENT_REG.CANCELLED",
        "No se puede transferir una inscripción cancelada",
        409,
      );
    }
    if (existing.user_id === toUserId) {
      throw new MpError(
        "EVENT_REG.SAME_USER",
        "El usuario destino ya es el titular de la inscripción",
        422,
      );
    }

    // Verificar que el perfil destino existe.
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", toUserId)
      .maybeSingle();
    if (!profile) {
      throw new MpError("EVENT_REG.USER_NOT_FOUND", "Usuario destino no existe", 404);
    }

    // Verificar que el destino no esté ya inscrito al mismo evento.
    const { data: dup } = await supabase
      .from("event_registrations")
      .select("id,status")
      .eq("event_id", existing.event_id as string)
      .eq("user_id", toUserId)
      .neq("status", "cancelled")
      .maybeSingle();
    if (dup) {
      throw new MpError(
        "EVENT_REG.TARGET_ALREADY_REGISTERED",
        "El usuario destino ya está inscrito a este evento",
        409,
      );
    }

    const fromUserId = existing.user_id as string;
    const { data: updated, error } = await supabase
      .from("event_registrations")
      .update({ user_id: toUserId } as never)
      .eq("id", registrationId)
      .select("id,event_id,user_id,status,paid_transaction_id,created_at")
      .single();
    if (error) {
      // 23505 = unique violation, por si hubo race con una inscripción activa.
      if (error.code === "23505") {
        throw new MpError(
          "EVENT_REG.TARGET_ALREADY_REGISTERED",
          "El usuario destino ya está inscrito a este evento",
          409,
        );
      }
      throw new MpError("EVENT_REG.TRANSFER_FAILED", error.message, 500);
    }

    await writeAuditLog({
      entity: "event_registrations",
      entityId: registrationId,
      action: "event_registration.admin_transfer",
      diff: {
        fromUserId,
        toUserId,
        eventId: existing.event_id ?? null,
      },
    });

    return mapReg(updated);
  });
}
