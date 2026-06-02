"use server";

// Admin: editar/reprogramar metadata de un evento.
// Aislado de events.ts para evitar pisar otros agentes que tocan ese archivo.
// Si cambia startsAt/endsAt encola jobs en notification_jobs con kind
// 'event_rescheduled' para cada inscripción activa (status='registered').

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { EventPaymentPolicySchema, EventSchema, type EventRow } from "@/lib/schemas/events";

async function requireAdminUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Admin required");
  return user.id;
}

function mapEvent(row: Record<string, unknown>): EventRow {
  return EventSchema.parse({
    id: row.id,
    clubId: (row.club_id as string | null) ?? null,
    partnerId: (row.partner_id as string | null) ?? null,
    organizerId: row.organizer_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    coverUrl: row.cover_url ?? null,
    kind: row.kind,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: (row.capacity as number | null) ?? null,
    priceCents: row.price_cents,
    currency: (row.currency as string | null) ?? null,
    paymentPolicy: (row.payment_policy as string | null) ?? "prepay",
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const UpdateEventAdminSchema = z.object({
  eventId: UuidSchema,
  patch: z
    .object({
      name: z.string().min(2).max(120).optional(),
      description: z.string().max(2000).nullable().optional(),
      startsAt: z.string().datetime({ offset: true }).optional(),
      endsAt: z.string().datetime({ offset: true }).optional(),
      capacity: z.number().int().positive().nullable().optional(),
      priceCents: z.number().int().min(0).optional(),
      paymentPolicy: EventPaymentPolicySchema.optional(),
    })
    .refine((p) => Object.keys(p).length > 0, {
      message: "patch vacío",
    }),
});

export async function updateEventAdmin(
  input: unknown,
): Promise<ActionResult<EventRow>> {
  return runAction(UpdateEventAdminSchema, input, async ({ eventId, patch }) => {
    const adminUserId = await requireAdminUserId();
    const supabase = await getServerClient();

    const { data: existing, error: readErr } = await supabase
      .from("events")
      .select("id,name,description,starts_at,ends_at,capacity,price_cents,status,payment_policy")
      .eq("id", eventId)
      .single();
    if (readErr || !existing) {
      throw new MpError("EVENTS.NOT_FOUND", "Evento no encontrado", 404);
    }
    if (existing.status === "finished" || existing.status === "cancelled") {
      throw new MpError(
        "EVENTS.NOT_EDITABLE",
        `No se puede editar un evento '${existing.status}'`,
        409,
      );
    }

    // Construir update solo con campos enviados.
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.startsAt !== undefined) update.starts_at = patch.startsAt;
    if (patch.endsAt !== undefined) update.ends_at = patch.endsAt;
    if (patch.capacity !== undefined) update.capacity = patch.capacity;
    if (patch.priceCents !== undefined) update.price_cents = patch.priceCents;
    if (patch.paymentPolicy !== undefined) update.payment_policy = patch.paymentPolicy;

    // Validar coherencia start < end con valores resultantes.
    const newStart = (update.starts_at as string | undefined) ?? (existing.starts_at as string);
    const newEnd = (update.ends_at as string | undefined) ?? (existing.ends_at as string);
    if (new Date(newStart) >= new Date(newEnd)) {
      throw new MpError(
        "EVENTS.BAD_RANGE",
        "La fecha de inicio debe ser anterior a la de fin",
        422,
      );
    }

    // Validar coherencia precio ↔ policy (mismo CHECK que la DB, mensaje claro).
    const resultingPrice =
      (update.price_cents as number | undefined) ?? (existing.price_cents as number);
    const resultingPolicy =
      (update.payment_policy as string | undefined) ?? (existing.payment_policy as string);
    if (resultingPrice === 0 && resultingPolicy !== "free") {
      throw new MpError(
        "EVENTS.POLICY_MISMATCH",
        "Eventos sin precio deben tener policy='free'",
        422,
      );
    }
    if (resultingPrice > 0 && resultingPolicy === "free") {
      throw new MpError(
        "EVENTS.POLICY_MISMATCH",
        "Eventos con precio no pueden tener policy='free'; usa prepay/onsite/flexible",
        422,
      );
    }

    const admin = getAdminClient();
    await setAuditActor(admin, adminUserId, "admin");
    const { data: updated, error: updErr } = await admin
      .from("events")
      .update(update as never)
      .eq("id", eventId)
      .select()
      .single();
    if (updErr) throw new MpError("EVENTS.UPDATE_FAILED", updErr.message, 500);

    // Audit log explícito vía RPC SECURITY DEFINER (action: event.admin_edit).
    // El trigger tg_audit ya grabó una fila con action='UPDATE'; esta segunda
    // entrada añade el contexto semántico de "edición administrativa".
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of Object.keys(update)) {
      diff[key] = {
        before: (existing as Record<string, unknown>)[key] ?? null,
        after: (updated as Record<string, unknown>)[key] ?? null,
      };
    }
    const { error: logErr } = await admin.rpc("fn_admin_audit_log", {
      p_entity: "events",
      p_entity_id: eventId,
      p_action: "event.admin_edit",
      p_diff: diff as never,
    });
    if (logErr) {
      // No abortamos la edición por un fallo del log, pero lo dejamos en stderr.
      console.error("[updateEventAdmin] audit rpc failed:", logErr.message);
    }

    // Si cambió starts_at o ends_at: encolar notificaciones a inscritos activos.
    const dateChanged =
      patch.startsAt !== undefined || patch.endsAt !== undefined;
    if (dateChanged) {
      const { data: regs } = await supabase
        .from("event_registrations")
        .select("user_id")
        .eq("event_id", eventId)
        .eq("status", "registered");
      const userIds = Array.from(
        new Set((regs ?? []).map((r) => r.user_id as string)),
      );
      if (userIds.length > 0) {
        const payloadBase = {
          event_id: eventId,
          event_name: updated.name,
          starts_at: updated.starts_at,
          ends_at: updated.ends_at,
          previous_starts_at: existing.starts_at,
          previous_ends_at: existing.ends_at,
        };
        const jobs = userIds.map((uid) => ({
          user_id: uid,
          role: "user",
          kind: "event_rescheduled",
          channel: "inapp",
          payload: payloadBase,
          status: "pending",
        }));
        const { error: jobErr } = await admin
          .from("notification_jobs")
          .insert(jobs as never);
        if (jobErr) {
          console.error(
            "[updateEventAdmin] enqueue notifications failed:",
            jobErr.message,
          );
        }
      }
    }

    return mapEvent(updated);
  });
}
