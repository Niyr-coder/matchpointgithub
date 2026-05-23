"use server";

// Admin · acciones de moderación sobre teams de usuarios.
// Toda mutación via service-role (getAdminClient + setAuditActor).
// Los flags status/is_verified/is_pinned están protegidos por un trigger
// (mig 165 fn_teams_protect_admin_fields) que bloquea cambios para
// callers con auth.uid() — solo service-role los puede tocar.
import "server-only";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
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

// Helper: enqueue notif para todos los miembros (incluido captain) de un team.
async function notifyTeamMembers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  teamId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: members } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId);
  const ids = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
  if (ids.length === 0) return;
  await admin.from("notification_jobs").insert(
    ids.map((uid) => ({
      user_id: uid,
      role: "user",
      kind,
      channel: "inapp",
      payload,
      status: "pending",
    })) as never,
  );
}

// ── setTeamStatus ──────────────────────────────────────────────────────
const SetStatusSchema = z.object({
  teamId: UuidSchema,
  status: z.enum(["active", "suspended", "archived"]),
  reason: z.string().max(280).optional(),
});

export async function setTeamStatusAdmin(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetStatusSchema, input, async ({ teamId, status, reason }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: team, error: tErr } = await (admin as any)
      .from("teams")
      .select("id,name,status")
      .eq("id", teamId)
      .maybeSingle();
    if (tErr || !team) throw new MpError("TEAMS.NOT_FOUND", "Team no encontrado", 404);
    if (team.status === status) {
      throw new MpError("TEAMS.STATUS_UNCHANGED", `Ya está en '${status}'`, 409);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("teams")
      .update({ status })
      .eq("id", teamId);
    if (error) throw new MpError("TEAMS.STATUS_FAILED", error.message, 500);

    // Notif a miembros — branch según transición.
    const kind =
      status === "suspended"
        ? "team_suspended"
        : status === "archived"
          ? "team_archived"
          : "team_reactivated";
    try {
      await notifyTeamMembers(admin, teamId, kind, {
        team_name: team.name,
        ...(reason ? { reason } : {}),
      });
    } catch (e) {
      console.error("[setTeamStatusAdmin] notif failed", e);
    }
    revalidatePath("/dashboard/admin/admin-user-teams");
    revalidatePath("/dashboard/user/team");
    return { ok: true as const };
  });
}

// ── setTeamVerified ────────────────────────────────────────────────────
const SetVerifiedSchema = z.object({
  teamId: UuidSchema,
  verified: z.boolean(),
});

export async function setTeamVerifiedAdmin(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetVerifiedSchema, input, async ({ teamId, verified }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("teams")
      .update({ is_verified: verified })
      .eq("id", teamId);
    if (error) throw new MpError("TEAMS.VERIFY_FAILED", error.message, 500);
    revalidatePath("/dashboard/admin/admin-user-teams");
    revalidatePath("/dashboard/user/team");
    return { ok: true as const };
  });
}

// ── setTeamPinned ──────────────────────────────────────────────────────
const SetPinnedSchema = z.object({
  teamId: UuidSchema,
  pinned: z.boolean(),
});

export async function setTeamPinnedAdmin(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(SetPinnedSchema, input, async ({ teamId, pinned }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("teams")
      .update({ is_pinned: pinned })
      .eq("id", teamId);
    if (error) throw new MpError("TEAMS.PIN_FAILED", error.message, 500);
    revalidatePath("/dashboard/admin/admin-user-teams");
    return { ok: true as const };
  });
}

// ── forceTransferCaptainAdmin ──────────────────────────────────────────
// Asigna captain a un miembro del team bypaseando el chequeo de "caller is
// captain" de la RPC pública. Service-role puede actualizar teams.captain_id
// directamente (la policy teams_captain_write bloquea solo a auth.uid()
// callers; el trigger fn_teams_protect_admin_fields no cubre captain_id).
const ForceTransferSchema = z.object({
  teamId: UuidSchema,
  newCaptainUserId: UuidSchema,
});

export async function forceTransferCaptainAdmin(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(ForceTransferSchema, input, async ({ teamId, newCaptainUserId }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: team } = await (admin as any)
      .from("teams")
      .select("id,name,captain_id")
      .eq("id", teamId)
      .maybeSingle();
    if (!team) throw new MpError("TEAMS.NOT_FOUND", "Team no encontrado", 404);
    if (team.captain_id === newCaptainUserId) {
      throw new MpError("TEAMS.SAME_CAPTAIN", "Ya es el capitán actual", 409);
    }
    // Validar que el destino sea miembro del team.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (admin as any)
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("user_id", newCaptainUserId)
      .maybeSingle();
    if (!member) {
      throw new MpError(
        "TEAMS.NEW_CAPTAIN_NOT_MEMBER",
        "El nuevo capitán debe ser miembro del team",
        409,
      );
    }
    // Validar que el destino no sea captain de OTRO team (regla 1/1).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: otherTeam } = await (admin as any)
      .from("teams")
      .select("id")
      .eq("captain_id", newCaptainUserId)
      .neq("id", teamId)
      .limit(1)
      .maybeSingle();
    if (otherTeam) {
      throw new MpError(
        "TEAMS.ALREADY_CAPTAIN",
        "El destino ya es capitán de otro team",
        409,
      );
    }
    // Update captain_id + roles del antiguo/nuevo captain en team_members.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e1 } = await (admin as any)
      .from("teams")
      .update({ captain_id: newCaptainUserId })
      .eq("id", teamId);
    if (e1) throw new MpError("TEAMS.TRANSFER_FAILED", e1.message, 500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("team_members")
      .update({ role: "player" })
      .eq("team_id", teamId)
      .eq("user_id", team.captain_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("team_members")
      .update({ role: "captain" })
      .eq("team_id", teamId)
      .eq("user_id", newCaptainUserId);
    revalidatePath("/dashboard/admin/admin-user-teams");
    revalidatePath("/dashboard/user/team");
    return { ok: true as const };
  });
}

// ── adminDissolveTeam ──────────────────────────────────────────────────
// Hard delete (cascade en team_members, team_invites, etc).
export async function adminDissolveTeam(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ teamId: UuidSchema }), input, async ({ teamId }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: team } = await (admin as any)
      .from("teams")
      .select("id,name")
      .eq("id", teamId)
      .maybeSingle();
    if (!team) throw new MpError("TEAMS.NOT_FOUND", "Team no encontrado", 404);
    // Antes de borrar, capturamos ids para notificar (después del delete los
    // team_members ya no existen).
    try {
      await notifyTeamMembers(admin, teamId, "team_dissolved_by_admin", {
        team_name: team.name,
      });
    } catch (e) {
      console.error("[adminDissolveTeam] notif failed", e);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("teams").delete().eq("id", teamId);
    if (error) throw new MpError("TEAMS.DISBAND_FAILED", error.message, 500);
    revalidatePath("/dashboard/admin/admin-user-teams");
    revalidatePath("/dashboard/user/team");
    return { ok: true as const };
  });
}

// ── sendAdminDmToCaptain ───────────────────────────────────────────────
// Mensaje del equipo MATCHPOINT al captain de un team específico. Enqueue
// notif inapp con el body inline (no usa system message DM por ahora; se
// puede extender después con sendSystemMessage si quieres persistirlo en
// /mensajes).
const SendDmSchema = z.object({
  teamId: UuidSchema,
  body: z.string().min(2).max(1000),
});

export async function sendAdminDmToCaptain(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(SendDmSchema, input, async ({ teamId, body }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: team } = await (admin as any)
      .from("teams")
      .select("id,name,captain_id")
      .eq("id", teamId)
      .maybeSingle();
    if (!team) throw new MpError("TEAMS.NOT_FOUND", "Team no encontrado", 404);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("notification_jobs").insert({
      user_id: team.captain_id,
      role: "user",
      kind: "team_admin_message",
      channel: "inapp",
      payload: { team_name: team.name, body },
      status: "pending",
    });
    if (error) throw new MpError("TEAMS.DM_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── bulkAdminDmToCaptains ──────────────────────────────────────────────
// Mensaje masivo a N capitanes (ids de teams).
const BulkDmSchema = z.object({
  teamIds: z.array(UuidSchema).min(1).max(500),
  body: z.string().min(2).max(1000),
});

export async function bulkAdminDmToCaptains(
  input: unknown,
): Promise<ActionResult<{ sent: number }>> {
  return runAction(BulkDmSchema, input, async ({ teamIds, body }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: teams } = await (admin as any)
      .from("teams")
      .select("id,name,captain_id")
      .in("id", teamIds);
    const rows = ((teams ?? []) as Array<{ id: string; name: string; captain_id: string }>).map(
      (t) => ({
        user_id: t.captain_id,
        role: "user",
        kind: "team_admin_message",
        channel: "inapp",
        payload: { team_name: t.name, body, team_id: t.id },
        status: "pending",
      }),
    );
    if (rows.length === 0) return { sent: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("notification_jobs").insert(rows);
    if (error) throw new MpError("TEAMS.DM_BULK_FAILED", error.message, 500);
    return { sent: rows.length };
  });
}

// ── bulkSetTeamStatus ──────────────────────────────────────────────────
// Acción masiva (ej. archivar N teams seleccionados).
const BulkStatusSchema = z.object({
  teamIds: z.array(UuidSchema).min(1).max(200),
  status: z.enum(["active", "suspended", "archived"]),
});

export async function bulkSetTeamStatusAdmin(
  input: unknown,
): Promise<ActionResult<{ updated: number }>> {
  return runAction(BulkStatusSchema, input, async ({ teamIds, status }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: teamsBefore } = await (admin as any)
      .from("teams")
      .select("id,name,status")
      .in("id", teamIds);
    const targetTeams = (
      (teamsBefore ?? []) as Array<{ id: string; name: string; status: string }>
    ).filter((t) => t.status !== status);
    if (targetTeams.length === 0) return { updated: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("teams")
      .update({ status })
      .in(
        "id",
        targetTeams.map((t) => t.id),
      );
    if (error) throw new MpError("TEAMS.STATUS_FAILED", error.message, 500);
    // Notif por team (best-effort, no rompe si falla).
    const kind =
      status === "suspended"
        ? "team_suspended"
        : status === "archived"
          ? "team_archived"
          : "team_reactivated";
    for (const t of targetTeams) {
      try {
        await notifyTeamMembers(admin, t.id, kind, { team_name: t.name });
      } catch (e) {
        console.error("[bulkSetTeamStatusAdmin] notif failed", t.id, e);
      }
    }
    revalidatePath("/dashboard/admin/admin-user-teams");
    revalidatePath("/dashboard/user/team");
    return { updated: targetTeams.length };
  });
}
