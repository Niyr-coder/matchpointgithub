"use server";

// Acciones admin sobre tournament registrations (tabla `registrations`).
//
// Notas de schema:
// - registrations.status acepta ['pending','accepted','rejected','withdrawn','waitlist']
//   (CHECK constraint). Para "remover" usamos status='withdrawn'.
// - Las registrations pueden tener team_id o varios player_ids. La
//   transferencia de cupo es compleja en este modelo (¿se reemplaza el
//   team entero?, ¿solo un jugador del array?) — NO implementamos
//   transferEventSlotAdmin para torneos. Se deja TODO en comentario.
//
// El audit trigger tg_audit ya emite UPDATE genéricos; adicionalmente
// llamamos fn_admin_audit_log (RPC en migration 042) para dejar `action`
// semántico (ej. 'registration.admin_remove').

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { promoteFromWaitlist } from "@/lib/tournaments/waitlist";

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
  if (error) console.error("[admin-tournament-registrations] audit log failed", error);
}

async function getTournamentNotificationPayload(
  admin: ReturnType<typeof getAdminClient>,
  tournamentId: string,
): Promise<Record<string, unknown>> {
  const { data: tournament } = await admin
    .from("tournaments")
    .select("id,name,slug,starts_at,ends_at")
    .eq("id", tournamentId)
    .maybeSingle();

  return {
    tournament_id: tournamentId,
    tournament_name: tournament?.name ?? "tu torneo",
    tournament_slug: tournament?.slug ?? null,
    starts_at: tournament?.starts_at ?? null,
    ends_at: tournament?.ends_at ?? null,
  };
}

async function enqueueTournamentRegistrationNotification(params: {
  admin: ReturnType<typeof getAdminClient>;
  userIds: string[];
  kind: "registration_accepted" | "registration_rejected" | "tournament_registration_removed";
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

export type TournamentRegistrationRow = {
  id: string;
  tournamentId: string;
  categoryId: string | null;
  teamId: string | null;
  playerIds: string[];
  status: string;
  paidTransactionId: string | null;
  createdAt: string;
};

function mapReg(row: Record<string, unknown>): TournamentRegistrationRow {
  return {
    id: row.id as string,
    tournamentId: row.tournament_id as string,
    categoryId: (row.category_id as string | null) ?? null,
    teamId: (row.team_id as string | null) ?? null,
    playerIds: (row.player_ids as string[]) ?? [],
    status: row.status as string,
    paidTransactionId: (row.paid_transaction_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

// ── removeTournamentRegistrationAdmin ──────────────────────────────────
const RemoveSchema = z.object({
  registrationId: UuidSchema,
  reason: z.string().min(2).max(500).optional(),
});

export async function removeTournamentRegistrationAdmin(
  input: unknown,
): Promise<ActionResult<TournamentRegistrationRow>> {
  return runAction(RemoveSchema, input, async ({ registrationId, reason }) => {
    const adminUserId = await requireAdminUserId();
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("registrations")
      .select("id,tournament_id,category_id,team_id,player_ids,status,paid_transaction_id,created_at")
      .eq("id", registrationId)
      .single();
    if (!existing) {
      throw new MpError("REGISTRATION.NOT_FOUND", "Registración no encontrada", 404);
    }
    if (existing.status === "withdrawn" || existing.status === "rejected") {
      throw new MpError(
        "REGISTRATION.ALREADY_REMOVED",
        `Ya estaba en estado '${existing.status}'`,
        409,
      );
    }

    const admin = getAdminClient();
    await setAuditActor(admin, adminUserId, "admin");
    const { data: updated, error } = await admin
      .from("registrations")
      .update({ status: "withdrawn" } as never)
      .eq("id", registrationId)
      .select("id,tournament_id,category_id,team_id,player_ids,status,paid_transaction_id,created_at")
      .single();
    if (error) {
      throw new MpError("REGISTRATION.REMOVE_FAILED", error.message, 500);
    }

    await writeAuditLog({
      admin,
      entity: "registrations",
      entityId: registrationId,
      action: "registration.admin_remove",
      diff: {
        reason: reason ?? null,
        previousStatus: existing.status,
        paidTransactionId: existing.paid_transaction_id ?? null,
        refundPending: existing.paid_transaction_id != null,
      },
    });

    const tournamentPayload = await getTournamentNotificationPayload(
      admin,
      existing.tournament_id as string,
    );
    await enqueueTournamentRegistrationNotification({
      admin,
      userIds: (existing.player_ids as string[] | null) ?? [],
      kind: "tournament_registration_removed",
      payload: {
        ...tournamentPayload,
        registration_id: registrationId,
        reason: reason ?? null,
        previous_status: existing.status,
      },
      logContext: "removeTournamentRegistrationAdmin",
    });

    // Si se liberó un cupo real, promover al primero de la lista de espera.
    if (existing.status === "pending" || existing.status === "accepted") {
      void promoteFromWaitlist(admin, {
        tournamentId: existing.tournament_id as string,
        categoryId: (existing.category_id as string | null) ?? null,
      });
    }

    return mapReg(updated);
  });
}

// ── markTournamentRegistrationStatusAdmin ──────────────────────────────
const StatusSchema = z.object({
  registrationId: UuidSchema,
  status: z.enum(["accepted", "pending", "rejected"]),
});

export async function markTournamentRegistrationStatusAdmin(
  input: unknown,
): Promise<ActionResult<TournamentRegistrationRow>> {
  return runAction(StatusSchema, input, async ({ registrationId, status }) => {
    const adminUserId = await requireAdminUserId();
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("registrations")
      .select("id,tournament_id,category_id,team_id,player_ids,status,paid_transaction_id,created_at")
      .eq("id", registrationId)
      .single();
    if (!existing) {
      throw new MpError("REGISTRATION.NOT_FOUND", "Registración no encontrada", 404);
    }
    if (existing.status === "withdrawn") {
      throw new MpError(
        "REGISTRATION.WITHDRAWN",
        "La registración fue retirada; no se puede cambiar el estado",
        409,
      );
    }
    if (existing.status === status) {
      throw new MpError(
        "REGISTRATION.SAME_STATUS",
        `Ya estaba en estado '${status}'`,
        409,
      );
    }

    const admin = getAdminClient();
    await setAuditActor(admin, adminUserId, "admin");
    const { data: updated, error } = await admin
      .from("registrations")
      .update({ status } as never)
      .eq("id", registrationId)
      .select("id,tournament_id,category_id,team_id,player_ids,status,paid_transaction_id,created_at")
      .single();
    if (error) {
      throw new MpError("REGISTRATION.UPDATE_FAILED", error.message, 500);
    }

    await writeAuditLog({
      admin,
      entity: "registrations",
      entityId: registrationId,
      action: "registration.admin_mark_status",
      diff: {
        previousStatus: existing.status,
        newStatus: status,
      },
    });

    if (status === "accepted" || status === "rejected") {
      const tournamentPayload = await getTournamentNotificationPayload(
        admin,
        existing.tournament_id as string,
      );
      await enqueueTournamentRegistrationNotification({
        admin,
        userIds: (existing.player_ids as string[] | null) ?? [],
        kind: status === "accepted" ? "registration_accepted" : "registration_rejected",
        payload: {
          ...tournamentPayload,
          registration_id: registrationId,
          previous_status: existing.status,
        },
        logContext: "markTournamentRegistrationStatusAdmin",
      });
    }

    // Rechazar una inscripción activa libera cupo → promover waitlist.
    if (
      status === "rejected" &&
      (existing.status === "pending" || existing.status === "accepted")
    ) {
      void promoteFromWaitlist(admin, {
        tournamentId: existing.tournament_id as string,
        categoryId: (existing.category_id as string | null) ?? null,
      });
    }

    return mapReg(updated);
  });
}

// TODO: transferTournamentSlotAdmin
// Las registrations de torneo pueden tener team_id (refiere a teams.id) o
// player_ids (uuid[]) — por tanto "transferir cupo" es ambiguo en este
// modelo: ¿se reemplaza el team entero?, ¿se reemplaza un solo jugador del
// array y cuál?, ¿qué pasa con el captain? Lo dejamos sin implementar y
// sin botón UI hasta que se defina el producto.
