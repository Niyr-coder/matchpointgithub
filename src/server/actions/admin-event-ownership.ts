"use server";

// Admin-only: reasignación de organizador para eventos y torneos.
// Agente D · contactar/reasignar organizador.
//
// Reglas de schema confirmadas leyendo las migrations:
// - `events.organizer_id` (021_events.sql) → uuid FK a profiles(id)
// - `tournaments.created_by` (020_tournaments.sql) → uuid FK a profiles(id);
//   los joins existentes en `getTournamentForAdmin` ya usan el FK
//   `tournaments_created_by_fkey`, por lo que ese es el campo "organizador".
//
// El audit_log se llena automáticamente por el trigger `tg_audit` (migración
// 099_audit_triggers.sql) sobre las tablas `events` y `tournaments`, con
// `diff = { before, after }`. No insertamos manualmente porque la RLS de
// audit_log revoca INSERT a los roles authenticated/anon.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Tienes que iniciar sesión");
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
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Requieres rol admin");
  return userId;
}

// Roles aceptables para un organizador de evento o torneo.
// Patrón tomado de `assertCanCreateEvent` (events.ts) y `requirePartnerAdmin`
// (tournaments.ts): admin global, owner/manager de club o partner owner/admin.
const ORGANIZER_ROLES = new Set(["admin", "owner", "manager", "partner"]);

async function assertCanBeOrganizer(targetUserId: string): Promise<void> {
  const supabase = await getServerClient();
  // 1) ¿Existe el profile?
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (!prof) {
    throw new MpError("ADMIN.ORG.USER_NOT_FOUND", "Usuario no encontrado", 404);
  }
  // 2) ¿Tiene rol global aceptable?
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", targetUserId)
    .is("revoked_at", null);
  const hasGlobalRole = (roles ?? []).some((r) =>
    ORGANIZER_ROLES.has(r.role as string),
  );
  if (hasGlobalRole) return;
  // 3) ¿Es miembro owner/admin de algún partner?
  const { data: pm } = await supabase
    .from("partner_members")
    .select("role")
    .eq("user_id", targetUserId)
    .in("role", ["owner", "admin"])
    .limit(1);
  if (pm && pm.length > 0) return;
  throw new MpError(
    "ADMIN.ORG.NOT_ELIGIBLE",
    "El usuario no tiene rol adecuado para organizar (admin, owner, manager o partner-admin)",
    422,
  );
}

// ── reassignEventOrganizerAdmin ───────────────────────────────────────────
const ReassignEventSchema = z.object({
  eventId: UuidSchema,
  newOrganizerUserId: UuidSchema,
});

export async function reassignEventOrganizerAdmin(
  input: unknown,
): Promise<ActionResult<{ eventId: string; oldOrganizerId: string; newOrganizerId: string }>> {
  return runAction(ReassignEventSchema, input, async ({ eventId, newOrganizerUserId }) => {
    const adminUserId = await requireAdminUserId();
    const supabase = await getServerClient();

    const { data: existing } = await supabase
      .from("events")
      .select("id,organizer_id")
      .eq("id", eventId)
      .maybeSingle();
    if (!existing) throw new MpError("EVENTS.NOT_FOUND", "Evento no encontrado", 404);
    const oldOrganizerId = existing.organizer_id as string;
    if (oldOrganizerId === newOrganizerUserId) {
      throw new MpError(
        "ADMIN.ORG.SAME_USER",
        "El usuario ya es el organizador actual",
        409,
      );
    }

    await assertCanBeOrganizer(newOrganizerUserId);

    const admin = getAdminClient();
    await setAuditActor(admin, adminUserId, "admin");
    const { error } = await admin
      .from("events")
      .update({ organizer_id: newOrganizerUserId } as never)
      .eq("id", eventId);
    if (error) throw new MpError("ADMIN.ORG.UPDATE_FAILED", error.message, 500);

    // tg_audit registra automáticamente el UPDATE con diff before/after en
    // audit_log (entity='events', action='UPDATE'). Si en el futuro hace
    // falta un label específico 'event.admin_reassign_organizer', se puede
    // crear un RPC security-definer; por ahora el diff cubre la trazabilidad.
    return {
      eventId,
      oldOrganizerId,
      newOrganizerId: newOrganizerUserId,
    };
  });
}

// ── reassignTournamentOrganizerAdmin ──────────────────────────────────────
const ReassignTournamentSchema = z.object({
  tournamentId: UuidSchema,
  newOrganizerUserId: UuidSchema,
});

export async function reassignTournamentOrganizerAdmin(
  input: unknown,
): Promise<
  ActionResult<{ tournamentId: string; oldOrganizerId: string; newOrganizerId: string }>
> {
  return runAction(
    ReassignTournamentSchema,
    input,
    async ({ tournamentId, newOrganizerUserId }) => {
      const adminUserId = await requireAdminUserId();
      const supabase = await getServerClient();

      const { data: existing } = await supabase
        .from("tournaments")
        .select("id,created_by")
        .eq("id", tournamentId)
        .maybeSingle();
      if (!existing) {
        throw new MpError("TOURNAMENTS.NOT_FOUND", "Torneo no encontrado", 404);
      }
      const oldOrganizerId = existing.created_by as string;
      if (oldOrganizerId === newOrganizerUserId) {
        throw new MpError(
          "ADMIN.ORG.SAME_USER",
          "El usuario ya es el organizador actual",
          409,
        );
      }

      await assertCanBeOrganizer(newOrganizerUserId);

      const admin = getAdminClient();
      await setAuditActor(admin, adminUserId, "admin");
      const { error } = await admin
        .from("tournaments")
        .update({ created_by: newOrganizerUserId } as never)
        .eq("id", tournamentId);
      if (error) throw new MpError("ADMIN.ORG.UPDATE_FAILED", error.message, 500);

      // Audit log automático vía tg_audit (entity='tournaments').
      return {
        tournamentId,
        oldOrganizerId,
        newOrganizerId: newOrganizerUserId,
      };
    },
  );
}
