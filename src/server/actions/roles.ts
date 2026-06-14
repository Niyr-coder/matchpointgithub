"use server";

// Roles: admin asigna/revoca roles, aprueba/rechaza role_requests.
import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { assertCapability } from "@/lib/auth/capabilities";
import { notify, notifyAdmins } from "@/server/notifications/dispatch";
import { recipientRoleForAssignedRole } from "@/lib/notifications/helpers";

const ROLE = z.enum(["admin", "partner", "owner", "manager", "coach", "employee", "user"]);
const CLUB_SCOPED_ROLES = new Set(["owner", "manager", "coach", "employee"]);

const SAFE_SEARCH_TERM = /^[\p{L}\p{N} ._\-@]{1,32}$/u;
function sanitizeIlikeTerm(raw: string): string | null {
  const term = raw.replace(/^@/, "").trim();
  if (!term) return null;
  if (!SAFE_SEARCH_TERM.test(term)) return null;
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export type RoleMemberDTO = {
  assignmentId: string;
  userId: string;
  username: string;
  displayName: string;
  clubId: string | null;
  clubName: string | null;
  grantedAt: string;
};

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
    // ranking solo cuando el creador es Premium), no aquí.
    await requireUser();
    const supabase = await getServerClient();
    const term = sanitizeIlikeTerm(q);
    if (!term) return [];
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

const ROLE_LABEL_ES: Record<string, string> = { manager: "Manager", coach: "Coach", employee: "Empleado", owner: "Owner", partner: "Partner", admin: "Admin", user: "Usuario" };

// Notifica al staff cuando lo agregan/quitan de un club (cubre gap coach/employee/manager).
async function notifyStaffEvent(kind: "club_staff_assigned" | "club_staff_removed", userId: string, role: string, clubId: string): Promise<void> {
  const supabase = await getServerClient();
  const { data: club } = await supabase.from("clubs").select("name").eq("id", clubId).maybeSingle();
  const clubName = (club?.name as string) ?? "el club";
  const label = ROLE_LABEL_ES[role] ?? role;
  await notify({
    userId,
    role: role as "manager" | "coach" | "employee", // recipient_role = el rol otorgado
    kind,
    title: kind === "club_staff_assigned" ? `Te agregaron a ${clubName}` : `Te quitaron de ${clubName}`,
    body: kind === "club_staff_assigned" ? `Ahora eres ${label} del club.` : `Ya no eres ${label} de ${clubName}.`,
    payload: { clubId, role },
  });
}

async function notifyRoleEvent(kind: "role_assigned" | "role_revoked", userId: string, assignedRole: string, clubId: string | null): Promise<void> {
  const label = ROLE_LABEL_ES[assignedRole] ?? assignedRole;
  await notify({
    userId,
    role: recipientRoleForAssignedRole(assignedRole),
    kind,
    title: kind === "role_assigned" ? "Nuevo rol asignado" : "Rol revocado",
    body: kind === "role_assigned" ? `Tu cuenta recibió el rol ${label}.` : `Tu rol ${label} fue removido.`,
    payload: { role: assignedRole, clubId },
  });
}

export async function assignRole(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(
    z.object({
      userId: z.string().uuid(),
      role: ROLE,
      clubId: z.string().uuid().nullable().optional(),
      notes: z.string().max(500).optional(),
      termsVersion: z.string().max(64).optional(),
    }),
    input,
    async ({ userId, role, clubId, notes, termsVersion }) => {
      if (CLUB_SCOPED_ROLES.has(role) && !clubId) {
        throw new MpError("ROLES.CLUB_REQUIRED", `Role '${role}' requires a club`, 422);
      }
      if (!CLUB_SCOPED_ROLES.has(role) && clubId) {
        throw new MpError("ROLES.CLUB_FORBIDDEN", `Role '${role}' cannot be scoped to a club`, 422);
      }
      // Autorización: admin global, o owner del club si asigna staff del club.
      // RBAC (mig 158): además de ser owner del club, debe tener la capacidad
      // sys.roles (nivel own). Admin siempre pasa (mp_role_can admin=true). Así
      // editar owner.sys.roles en la matriz controla de verdad esta acción.
      let actorId: string;
      if (clubId && OWNER_ASSIGNABLE_ROLES.has(role)) {
        actorId = await requireAdminOrClubOwner(clubId);
        await assertCapability("sys.roles", { clubId });
      } else {
        actorId = await requireAdmin();
      }
      const supabase = await getServerClient();
      const { data: actorAdminRow } = await supabase
        .from("role_assignments")
        .select("id")
        .eq("user_id", actorId)
        .eq("role", "admin")
        .is("revoked_at", null)
        .maybeSingle();
      const actorIsAdmin = !!actorAdminRow;

      // Términos (Stage 2): si quien asigna es un OWNER (no admin) y es un rol de
      // club, debe aceptar la versión vigente de los términos. Se registra.
      let acceptedTerms: string | null = null;
      if (clubId && OWNER_ASSIGNABLE_ROLES.has(role)) {
        if (!actorIsAdmin) {
          const { data: cfg } = await supabase
            .from("platform_config")
            .select("value")
            .eq("key", "role_grant_terms_version")
            .maybeSingle();
          const currentVersion = cfg?.value ? String(cfg.value) : null;
          if (!termsVersion || !currentVersion || termsVersion !== currentVersion) {
            throw new MpError("ROLES.TERMS_REQUIRED", "Debes aceptar los términos vigentes para asignar este rol.", 422);
          }
          acceptedTerms = termsVersion;
        }
      }

      const admin = getAdminClient();
      await setAuditActor(admin, actorId, actorIsAdmin ? "admin" : "owner");
      const { data, error } = await admin
        .from("role_assignments")
        .insert({
          user_id: userId,
          role,
          club_id: clubId ?? null,
          granted_by: actorId,
          notes: notes ?? null,
          terms_version: acceptedTerms,
        } as never)
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") {
          // Unique violation: reactivate revoked existing.
          let q = admin
            .from("role_assignments")
            .update({ revoked_at: null, granted_by: actorId, granted_at: new Date().toISOString(), terms_version: acceptedTerms } as never)
            .eq("user_id", userId)
            .eq("role", role);
          q = clubId ? q.eq("club_id", clubId) : q.is("club_id", null);
          const { data: updated, error: upErr } = await q.select("id").single();
          if (upErr) throw new MpError("ROLES.ASSIGN_FAILED", upErr.message, 500);
          if (actorIsAdmin) await notifyRoleEvent("role_assigned", userId, role, clubId ?? null);
          else if (clubId && OWNER_ASSIGNABLE_ROLES.has(role)) await notifyStaffEvent("club_staff_assigned", userId, role, clubId);
          revalidatePath("/dashboard/admin/admin-roles");
          return { id: updated.id as string };
        }
        throw new MpError("ROLES.ASSIGN_FAILED", error.message, 500);
      }
      if (actorIsAdmin) await notifyRoleEvent("role_assigned", userId, role, clubId ?? null);
      else if (clubId && OWNER_ASSIGNABLE_ROLES.has(role)) await notifyStaffEvent("club_staff_assigned", userId, role, clubId);
      revalidatePath("/dashboard/admin/admin-roles");
      return { id: data.id as string };
    },
  );
}

export async function revokeRole(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ assignmentId: z.string().uuid() }), input, async ({ assignmentId }) => {
    const supabase = await getServerClient();
    // Simetría con assignRole: admin global, o owner del club para roles
    // club-scoped de SU club (con capacidad sys.roles). Mig 158/159.
    const { data: asg } = await supabase
      .from("role_assignments")
      .select("club_id,role,user_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (!asg) throw new MpError("ROLES.NOT_FOUND", "Asignación no encontrada", 404);
    const asgClub = asg.club_id as string | null;
    const asgRole = asg.role as string;
    const asgUser = asg.user_id as string;
    const isStaff = !!asgClub && OWNER_ASSIGNABLE_ROLES.has(asgRole);
    let actorId: string;
    if (isStaff) {
      actorId = await requireAdminOrClubOwner(asgClub!);
      await assertCapability("sys.roles", { clubId: asgClub! });
    } else {
      actorId = await requireAdmin();
    }
    const { data: actorAdminRow } = await supabase
      .from("role_assignments")
      .select("id")
      .eq("user_id", actorId)
      .eq("role", "admin")
      .is("revoked_at", null)
      .maybeSingle();
    const actorIsAdmin = !!actorAdminRow;
    const admin = getAdminClient();
    await setAuditActor(admin, actorId, actorIsAdmin ? "admin" : "owner");
    const { error } = await admin
      .from("role_assignments")
      .update({ revoked_at: new Date().toISOString() } as never)
      .eq("id", assignmentId)
      .is("revoked_at", null);
    if (error) throw new MpError("ROLES.REVOKE_FAILED", error.message, 500);
    if (actorIsAdmin) await notifyRoleEvent("role_revoked", asgUser, asgRole, asgClub);
    else if (isStaff) await notifyStaffEvent("club_staff_removed", asgUser, asgRole, asgClub!);
    revalidatePath("/dashboard/admin/admin-roles");
    return { ok: true as const };
  });
}

// Página de miembros de un rol (paginado; admin). Evita traer miles de filas.
export async function listRoleMembers(input: unknown): Promise<ActionResult<RoleMemberDTO[]>> {
  return runAction(
    z.object({ role: ROLE, offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(60).default(30), q: z.string().max(80).optional() }),
    input,
    async ({ role, offset, limit, q }) => {
      await requireAdmin();
      const supabase = await getServerClient();
      const rawTerm = q?.trim();
      const term = rawTerm ? sanitizeIlikeTerm(rawTerm) : null;
      if (rawTerm && !term) return [];
      let list: { id: string; user_id: string; club_id: string | null; granted_at: string }[];
      if (term) {
        // Búsqueda: primero matchear perfiles por nombre/@username, luego filtrar
        // a quienes tienen el rol. Evita depender de embed por FK.
        const { data: profs } = await supabase
          .from("profiles")
          .select("id")
          .or(`display_name.ilike.%${term}%,username.ilike.%${term}%`)
          .limit(100);
        const ids = (profs ?? []).map((p) => p.id as string);
        if (ids.length === 0) return [];
        const { data: rows } = await supabase
          .from("role_assignments")
          .select("id,user_id,club_id,granted_at")
          .eq("role", role)
          .is("revoked_at", null)
          .in("user_id", ids)
          .order("granted_at", { ascending: false })
          .limit(limit);
        list = (rows ?? []) as typeof list;
      } else {
        const { data: rows } = await supabase
          .from("role_assignments")
          .select("id,user_id,club_id,granted_at")
          .eq("role", role)
          .is("revoked_at", null)
          .order("granted_at", { ascending: false })
          .range(offset, offset + limit - 1);
        list = (rows ?? []) as typeof list;
      }
      const uids = Array.from(new Set(list.map((r) => r.user_id as string)));
      const cids = Array.from(new Set(list.map((r) => r.club_id as string | null).filter(Boolean) as string[]));
      const [{ data: profs }, { data: cl }] = await Promise.all([
        uids.length ? supabase.from("profiles").select("id,username,display_name").in("id", uids) : Promise.resolve({ data: [] }),
        cids.length ? supabase.from("clubs").select("id,name").in("id", cids) : Promise.resolve({ data: [] }),
      ]);
      const pById = new Map((profs ?? []).map((p) => [p.id as string, p]));
      const cById = new Map((cl ?? []).map((c) => [c.id as string, c.name as string]));
      return list.map((a) => ({
        assignmentId: a.id as string,
        userId: a.user_id as string,
        username: (pById.get(a.user_id as string)?.username as string) ?? "—",
        displayName: (pById.get(a.user_id as string)?.display_name as string) ?? "Sin nombre",
        clubId: (a.club_id as string | null) ?? null,
        clubName: a.club_id ? cById.get(a.club_id as string) ?? "—" : null,
        grantedAt: a.granted_at as string,
      }));
    },
  );
}

// Términos vigentes de asignación de rol (para mostrar al owner antes de aceptar).
export async function getRoleGrantTerms(): Promise<ActionResult<{ text: string; version: string }>> {
  return runAction(z.undefined(), undefined, async () => {
    await requireUser();
    const admin = getAdminClient();
    const { data } = await admin
      .from("platform_config")
      .select("key,value")
      .in("key", ["role_grant_terms", "role_grant_terms_version"]);
    const map = new Map((data ?? []).map((r) => [r.key as string, r.value]));
    return {
      text: map.get("role_grant_terms") ? String(map.get("role_grant_terms")) : "Eres responsable del uso que esta persona haga del rol mientras lo tenga. Puedes revocarlo en cualquier momento.",
      version: map.get("role_grant_terms_version") ? String(map.get("role_grant_terms_version")) : "2026-05-v1",
    };
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
      const admin = getAdminClient();
      await setAuditActor(admin, actorId, "admin");
      const { error: insErr } = await admin
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
      const { error: updErr } = await admin
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
        role: recipientRoleForAssignedRole(role),
        kind: "role_request_approved",
        title: "Tu solicitud de rol fue aprobada",
        body: `Ya tienes acceso como ${ROLE_LABEL_ES[role] ?? role}.`,
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
      const admin = getAdminClient();
      await setAuditActor(admin, actorId, "admin");
      const { error } = await admin
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
        const requestedRole = req.requested_role as string;
        await notify({
          userId: req.user_id as string,
          role: recipientRoleForAssignedRole(requestedRole),
          kind: "role_request_rejected",
          title: "Tu solicitud de rol fue rechazada",
          body: notes ?? null,
          payload: { requestId, role: requestedRole, requestedRole, notes: notes ?? null },
        });
      }
      revalidatePath("/dashboard/admin/admin-roles");
      return { ok: true as const };
    },
  );
}

export async function submitRoleRequest(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(
    z.object({
      requestedRole: ROLE,
      targetClubId: z.string().uuid().nullable().optional(),
      reason: z.string().max(500).optional(),
    }),
    input,
    async ({ requestedRole, targetClubId, reason }) => {
      const userId = await requireUser();
      if (CLUB_SCOPED_ROLES.has(requestedRole) && !targetClubId) {
        throw new MpError("ROLES.CLUB_REQUIRED", `Role '${requestedRole}' requires a club`, 422);
      }
      const supabase = await getServerClient();
      const { data: pending } = await supabase
        .from("role_requests")
        .select("id")
        .eq("user_id", userId)
        .eq("requested_role", requestedRole)
        .eq("status", "pending")
        .maybeSingle();
      if (pending) {
        throw new MpError("ROLES.REQUEST_PENDING", "Ya tienes una solicitud pendiente para este rol.", 409);
      }
      const { data, error } = await supabase
        .from("role_requests")
        .insert({
          user_id: userId,
          requested_role: requestedRole,
          target_club_id: targetClubId ?? null,
          reason: reason ?? null,
          status: "pending",
        } as never)
        .select("id")
        .single();
      if (error) throw new MpError("ROLES.REQUEST_CREATE_FAILED", error.message, 500);
      await notifyAdmins({
        kind: "role_request_new",
        title: "Nueva solicitud de rol",
        body: `${ROLE_LABEL_ES[requestedRole] ?? requestedRole}${targetClubId ? " · club" : ""}`,
        payload: { requestId: data.id, requestedRole, targetClubId: targetClubId ?? null },
      });
      revalidatePath("/dashboard/admin/admin-roles");
      return { id: data.id as string };
    },
  );
}
