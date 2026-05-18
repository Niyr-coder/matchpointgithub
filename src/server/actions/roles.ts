"use server";

// Roles: admin asigna/revoca roles, aprueba/rechaza role_requests.
import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { notify } from "@/server/notifications/dispatch";

const ROLE = z.enum(["admin", "partner", "owner", "manager", "coach", "employee", "user"]);
const CLUB_SCOPED_ROLES = new Set(["owner", "manager", "coach", "employee"]);

async function requireAdmin(): Promise<string> {
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

// Authn helper: cualquier usuario logueado.
async function requireUser(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

// Authz: admin OR owner del club indicado. Lanza si no califica.
async function requireAdminOrClubOwner(clubId: string): Promise<string> {
  const userId = await requireUser();
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .in("role", ["admin", "owner"]);
  const ok = (data ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.role === "owner" && r.club_id === clubId),
  );
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Admin or club owner required");
  return userId;
}

export async function searchUsers(input: unknown): Promise<ActionResult<{ id: string; username: string; display_name: string }[]>> {
  return runAction(z.object({ q: z.string().min(1).max(40) }), input, async ({ q }) => {
    // Cualquier usuario autenticado puede buscar (caso de uso: PlayerPicker
    // de matches/retos). La RLS de profiles ya restringe lo visible por fila.
    // El gate "premium" se aplica más arriba (ej: si el match cuenta para
    // ranking solo cuando el creador es Premium), no acá.
    await requireUser();
    const supabase = await getServerClient();
    const term = q.replace(/^@/, "").trim();
    const { data, error } = await supabase
      .from("profiles")
      .select("id,username,display_name")
      .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
      .limit(10);
    if (error) throw new MpError("ROLES.SEARCH_FAILED", error.message, 500);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      username: r.username as string,
      display_name: r.display_name as string,
    }));
  });
}

// Roles que un owner puede asignar dentro de su propio club.
const OWNER_ASSIGNABLE_ROLES = new Set(["manager", "coach", "employee"]);

export async function assignRole(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(
    z.object({
      userId: z.string().uuid(),
      role: ROLE,
      clubId: z.string().uuid().nullable().optional(),
      notes: z.string().max(500).optional(),
    }),
    input,
    async ({ userId, role, clubId, notes }) => {
      if (CLUB_SCOPED_ROLES.has(role) && !clubId) {
        throw new MpError("ROLES.CLUB_REQUIRED", `Role '${role}' requires a club`, 422);
      }
      if (!CLUB_SCOPED_ROLES.has(role) && clubId) {
        throw new MpError("ROLES.CLUB_FORBIDDEN", `Role '${role}' cannot be scoped to a club`, 422);
      }
      // Autorización: admin global, o owner del club si asigna staff del club.
      let actorId: string;
      if (clubId && OWNER_ASSIGNABLE_ROLES.has(role)) {
        actorId = await requireAdminOrClubOwner(clubId);
      } else {
        actorId = await requireAdmin();
      }
      const supabase = await getServerClient();
      const { data, error } = await supabase
        .from("role_assignments")
        .insert({
          user_id: userId,
          role,
          club_id: clubId ?? null,
          granted_by: actorId,
          notes: notes ?? null,
        } as never)
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") {
          // Unique violation: reactivate revoked existing.
          let q = supabase
            .from("role_assignments")
            .update({ revoked_at: null, granted_by: actorId, granted_at: new Date().toISOString() } as never)
            .eq("user_id", userId)
            .eq("role", role);
          q = clubId ? q.eq("club_id", clubId) : q.is("club_id", null);
          const { data: updated, error: upErr } = await q.select("id").single();
          if (upErr) throw new MpError("ROLES.ASSIGN_FAILED", upErr.message, 500);
          revalidatePath("/dashboard/admin/admin-roles");
          return { id: updated.id as string };
        }
        throw new MpError("ROLES.ASSIGN_FAILED", error.message, 500);
      }
      revalidatePath("/dashboard/admin/admin-roles");
      return { id: data.id as string };
    },
  );
}

export async function revokeRole(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ assignmentId: z.string().uuid() }), input, async ({ assignmentId }) => {
    await requireAdmin();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("role_assignments")
      .update({ revoked_at: new Date().toISOString() } as never)
      .eq("id", assignmentId)
      .is("revoked_at", null);
    if (error) throw new MpError("ROLES.REVOKE_FAILED", error.message, 500);
    revalidatePath("/dashboard/admin/admin-roles");
    return { ok: true as const };
  });
}

export async function approveRoleRequest(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({
      requestId: z.string().uuid(),
      clubId: z.string().uuid().nullable().optional(),
      notes: z.string().max(500).optional(),
    }),
    input,
    async ({ requestId, clubId, notes }) => {
      const actorId = await requireAdmin();
      const supabase = await getServerClient();
      const { data: req, error: getErr } = await supabase
        .from("role_requests")
        .select("user_id,requested_role,target_club_id,status")
        .eq("id", requestId)
        .single();
      if (getErr || !req) throw new MpError("ROLES.REQUEST_NOT_FOUND", "Request not found", 404);
      if (req.status !== "pending") {
        throw new MpError("ROLES.REQUEST_NOT_PENDING", `Status is '${req.status}'`, 409);
      }
      const finalClub = clubId ?? (req.target_club_id as string | null) ?? null;
      const role = req.requested_role as string;
      if (CLUB_SCOPED_ROLES.has(role) && !finalClub) {
        throw new MpError("ROLES.CLUB_REQUIRED", `Role '${role}' requires a club`, 422);
      }
      const { error: insErr } = await supabase
        .from("role_assignments")
        .insert({
          user_id: req.user_id as string,
          role,
          club_id: finalClub,
          granted_by: actorId,
          notes: notes ?? null,
        } as never);
      if (insErr && insErr.code !== "23505") {
        throw new MpError("ROLES.ASSIGN_FAILED", insErr.message, 500);
      }
      const { error: updErr } = await supabase
        .from("role_requests")
        .update({
          status: "approved",
          reviewed_by: actorId,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: notes ?? null,
        } as never)
        .eq("id", requestId);
      if (updErr) throw new MpError("ROLES.REQUEST_UPDATE_FAILED", updErr.message, 500);
      await notify({
        userId: req.user_id as string,
        role: "user",
        kind: "role_request_approved",
        title: "Tu solicitud de rol fue aprobada",
        body: `Ya tienes acceso como ${role}.`,
        payload: { requestId, role, clubId: finalClub },
      });
      revalidatePath("/dashboard/admin/admin-roles");
      return { ok: true as const };
    },
  );
}

export async function rejectRoleRequest(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({
      requestId: z.string().uuid(),
      notes: z.string().max(500).optional(),
    }),
    input,
    async ({ requestId, notes }) => {
      const actorId = await requireAdmin();
      const supabase = await getServerClient();
      const { data: req } = await supabase
        .from("role_requests")
        .select("user_id,requested_role")
        .eq("id", requestId)
        .maybeSingle();
      const { error } = await supabase
        .from("role_requests")
        .update({
          status: "rejected",
          reviewed_by: actorId,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: notes ?? null,
        } as never)
        .eq("id", requestId)
        .eq("status", "pending");
      if (error) throw new MpError("ROLES.REQUEST_UPDATE_FAILED", error.message, 500);
      if (req) {
        await notify({
          userId: req.user_id as string,
          role: "user",
          kind: "role_request_rejected",
          title: "Tu solicitud de rol fue rechazada",
          body: notes ?? null,
          payload: { requestId, requestedRole: req.requested_role },
        });
      }
      revalidatePath("/dashboard/admin/admin-roles");
      return { ok: true as const };
    },
  );
}
