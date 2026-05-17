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
  if (error) console.error("[admin-tournament-registrations] audit log failed", error);
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
    await requireAdminUserId();
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

    const { data: updated, error } = await supabase
      .from("registrations")
      .update({ status: "withdrawn" } as never)
      .eq("id", registrationId)
      .select("id,tournament_id,category_id,team_id,player_ids,status,paid_transaction_id,created_at")
      .single();
    if (error) {
      throw new MpError("REGISTRATION.REMOVE_FAILED", error.message, 500);
    }

    await writeAuditLog({
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
    await requireAdminUserId();
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

    const { data: updated, error } = await supabase
      .from("registrations")
      .update({ status } as never)
      .eq("id", registrationId)
      .select("id,tournament_id,category_id,team_id,player_ids,status,paid_transaction_id,created_at")
      .single();
    if (error) {
      throw new MpError("REGISTRATION.UPDATE_FAILED", error.message, 500);
    }

    await writeAuditLog({
      entity: "registrations",
      entityId: registrationId,
      action: "registration.admin_mark_status",
      diff: {
        previousStatus: existing.status,
        newStatus: status,
      },
    });

    return mapReg(updated);
  });
}

// TODO: transferTournamentSlotAdmin
// Las registrations de torneo pueden tener team_id (refiere a teams.id) o
// player_ids (uuid[]) — por tanto "transferir cupo" es ambiguo en este
// modelo: ¿se reemplaza el team entero?, ¿se reemplaza un solo jugador del
// array y cuál?, ¿qué pasa con el captain? Lo dejamos sin implementar y
// sin botón UI hasta que se defina el producto.
