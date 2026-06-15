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
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

async function writeAuditLog(params: {
  admin: ReturnType<typeof getAdminClient>;
  entity: string;
  entityId: string;
  action: string;
  diff?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await params.admin.rpc("fn_admin_audit_log", {
    p_entity: params.entity,
    p_entity_id: params.entityId,
    p_action: params.action,
    p_diff: (params.diff ?? {}) as never,
  });
  // No bloquear la mutación si el audit falla; solo loguear.
  if (error) console.error("[admin-event-registrations] audit log failed", error);
}

async function getEventNotificationPayload(
  admin: ReturnType<typeof getAdminClient>,
  eventId: string,
): Promise<Record<string, unknown>> {
  const { data: event } = await admin
    .from("events")
    .select("id,name,slug,starts_at,ends_at")
    .eq("id", eventId)
    .maybeSingle();

  return {
    event_id: eventId,
    event_name: event?.name ?? "tu evento",
    event_slug: event?.slug ?? null,
    starts_at: event?.starts_at ?? null,
    ends_at: event?.ends_at ?? null,
  };
}

async function enqueueEventRegistrationNotification(params: {
  admin: ReturnType<typeof getAdminClient>;
  userIds: string[];
  kind:
    | "event_registration_cancelled"
    | "event_registration_transferred"
    | "event_registration_no_show";
  payload: Record<string, unknown>;
  logContext: string;
}): Promise<void> {
  const userIds = Array.from(new Set(params.userIds.filter(Boolean)));
  if (userIds.length === 0) return;

  const jobs = userIds.map((uid) => ({
    user_id: uid,
    role: "user",
    kind: params.kind,
    channel: "inapp",
    payload: params.payload,
    status: "pending",
  }));
  const { error } = await params.admin.from("notification_jobs").insert(jobs as never);
  if (error) {
    console.error(`[${params.logContext}] enqueue notification failed:`, error.message);
  }
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
    const adminUserId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminUserId, "admin");
    const { data: existing } = await admin
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

    const { data: updated, error } = await admin
      .from("event_registrations")
      .update({ status: "cancelled" } as never)
      .eq("id", registrationId)
      .select("id,event_id,user_id,status,paid_transaction_id,created_at")
      .single();
    if (error) {
      throw new MpError("EVENT_REG.REMOVE_FAILED", error.message, 500);
    }

    await writeAuditLog({
      admin,
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

    const eventPayload = await getEventNotificationPayload(admin, existing.event_id as string);
    await enqueueEventRegistrationNotification({
      admin,
      userIds: [existing.user_id as string],
      kind: "event_registration_cancelled",
      payload: {
        ...eventPayload,
        registration_id: registrationId,
        reason: reason ?? null,
        previous_status: existing.status,
      },
      logContext: "removeEventRegistrationAdmin",
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
    const adminUserId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminUserId, "admin");
    const { data: existing } = await admin
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
    const { data: updated, error } = await admin
      .from("event_registrations")
      .update({ status: nextStatus } as never)
      .eq("id", registrationId)
      .select("id,event_id,user_id,status,paid_transaction_id,created_at")
      .single();
    if (error) {
      throw new MpError("EVENT_REG.ATTENDANCE_FAILED", error.message, 500);
    }

    await writeAuditLog({
      admin,
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
    const adminUserId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminUserId, "admin");
    const { data: existing } = await admin
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
    if (existing.status === "no_show") {
      throw new MpError(
        "EVENT_REG.ALREADY_NO_SHOW",
        "La inscripción ya estaba marcada como no-show",
        409,
      );
    }

    const { data: updated, error } = await admin
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
      const { data: tx } = await admin
        .from("transactions")
        .select("status")
        .eq("id", txId)
        .maybeSingle();
      if (tx && tx.status !== "captured" && tx.status !== "refunded" && tx.status !== "failed") {
        await admin
          .from("transactions")
          .update({ status: "failed" } as never)
          .eq("id", txId);
        txMarkedFailed = true;
      }
    }

    await writeAuditLog({
      admin,
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

    const eventPayload = await getEventNotificationPayload(admin, existing.event_id as string);
    await enqueueEventRegistrationNotification({
      admin,
      userIds: [existing.user_id as string],
      kind: "event_registration_no_show",
      payload: {
        ...eventPayload,
        registration_id: registrationId,
        reason: reason ?? null,
        previous_status: existing.status,
        linked_transaction_id: txId,
        tx_marked_failed: txMarkedFailed,
      },
      logContext: "markEventNoShowAdmin",
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
    const adminUserId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminUserId, "admin");
    const { data: existing } = await admin
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
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", toUserId)
      .maybeSingle();
    if (!profile) {
      throw new MpError("EVENT_REG.USER_NOT_FOUND", "Usuario destino no existe", 404);
    }

    // Verificar que el destino no esté ya inscrito al mismo evento.
    const { data: dup } = await admin
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
    const { data: updated, error } = await admin
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
      admin,
      entity: "event_registrations",
      entityId: registrationId,
      action: "event_registration.admin_transfer",
      diff: {
        fromUserId,
        toUserId,
        eventId: existing.event_id ?? null,
      },
    });

    const eventPayload = await getEventNotificationPayload(admin, existing.event_id as string);
    const eventName = String(eventPayload.event_name ?? "tu evento");
    await enqueueEventRegistrationNotification({
      admin,
      userIds: [fromUserId],
      kind: "event_registration_transferred",
      payload: {
        ...eventPayload,
        registration_id: registrationId,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        transfer_direction: "out",
        title: "Tu cupo fue transferido",
        body: `Tu cupo para ${eventName} fue transferido por administración.`,
      },
      logContext: "transferEventSlotAdmin",
    });
    await enqueueEventRegistrationNotification({
      admin,
      userIds: [toUserId],
      kind: "event_registration_transferred",
      payload: {
        ...eventPayload,
        registration_id: registrationId,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        transfer_direction: "in",
        title: "Recibiste un cupo",
        body: `Administración te asignó un cupo para ${eventName}.`,
      },
      logContext: "transferEventSlotAdmin",
    });

    return mapReg(updated);
  });
}
