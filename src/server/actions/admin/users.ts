"use server";

// Admin · suspensión / reactivación de usuarios (gap A1 de MAT-70).
//
// Toda mutación pasa por service-role (getAdminClient + setAuditActor) para
// que tg_audit (mig 029) registre quién hizo qué. La RLS de user_suspensions
// también permite admin via cliente normal, pero usamos admin client para
// estandarizar con el resto de actions de admin.
import "server-only";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { loadAdminUserDetail } from "@/server/queries/admin-user-detail";
import type { AdminUserDetail } from "@/lib/types/admin-user-detail";
import type { TablesUpdate } from "@/lib/db/types";
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

const SuspendUserSchema = z.object({
  userId: UuidSchema,
  reason: z.string().trim().min(3).max(1000),
});

const ReactivateUserSchema = z.object({
  userId: UuidSchema,
  reason: z.string().trim().min(3).max(1000).optional(),
});

export type SuspendUserResult = {
  suspensionId: string;
  userId: string;
  reason: string;
  suspendedAt: string;
};

// ── suspendUser ─────────────────────────────────────────────────────────
// Inserta una fila activa en user_suspensions. Si ya hay una activa, la
// constraint unique parcial impide duplicar y devolvemos error específico
// para que el caller muestre mensaje útil ("ya estaba suspendido").
//
// No invalida sesiones activas explícitamente: proxy.ts hace el chequeo en
// el siguiente request del usuario y lo bota a /login.
export async function suspendUser(
  input: unknown,
): Promise<ActionResult<SuspendUserResult>> {
  return runAction(SuspendUserSchema, input, async ({ userId, reason }) => {
    const adminId = await requireAdminUserId();
    if (adminId === userId) {
      throw new MpError(
        "ACCOUNT.CANNOT_SUSPEND_SELF",
        "No puedes suspenderte a ti mismo.",
        400,
      );
    }
    const admin = await getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    // Chequeo previo: ¿el usuario destino es admin? No permitimos suspender admins
    // desde esta acción (medida anti-shoot-in-foot; si hace falta sacar a un admin
    // del sistema se revoca el role_assignment primero).
    const { data: target } = await admin
      .from("role_assignments")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .is("revoked_at", null)
      .maybeSingle();
    if (target) {
      throw new MpError(
        "ACCOUNT.CANNOT_SUSPEND_ADMIN",
        "No puedes suspender a otro administrador. Revoca primero el rol admin.",
        400,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("user_suspensions")
      .insert({
        user_id: userId,
        reason,
        suspended_by: adminId,
      })
      .select("id, suspended_at")
      .single();

    if (error) {
      // Unique violation = ya estaba suspendido.
      if (error.code === "23505") {
        throw new MpError(
          "ACCOUNT.ALREADY_SUSPENDED",
          "Este usuario ya está suspendido.",
          409,
        );
      }
      throw new MpError("ACCOUNT.SUSPEND_FAILED", error.message, 500);
    }

    revalidatePath("/dashboard/admin/admin-users");

    return {
      suspensionId: data.id as string,
      userId,
      reason,
      suspendedAt: data.suspended_at as string,
    };
  });
}

// ── reactivateUser ──────────────────────────────────────────────────────
// Marca la suspensión activa como reactivada. El usuario vuelve a poder iniciar
// sesión y operar en el próximo request.
export async function reactivateUser(
  input: unknown,
): Promise<ActionResult<{ userId: string; reactivatedAt: string }>> {
  return runAction(ReactivateUserSchema, input, async ({ userId, reason }) => {
    const adminId = await requireAdminUserId();
    const admin = await getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("user_suspensions")
      .update({
        reactivated_at: new Date().toISOString(),
        reactivated_by: adminId,
        reactivation_reason: reason ?? null,
      })
      .eq("user_id", userId)
      .is("reactivated_at", null)
      .select("reactivated_at")
      .maybeSingle();

    if (error) throw new MpError("ACCOUNT.REACTIVATE_FAILED", error.message, 500);
    if (!data) {
      throw new MpError(
        "ACCOUNT.NOT_SUSPENDED",
        "Este usuario no tiene una suspensión activa.",
        404,
      );
    }

    revalidatePath("/dashboard/admin/admin-users");

    return {
      userId,
      reactivatedAt: data.reactivated_at as string,
    };
  });
}

const DeleteUserSchema = z.object({
  userId: UuidSchema,
  reason: z.string().trim().min(10).max(1000),
});

const AdminProfileUpdateSchema = z.object({
  userId: UuidSchema,
  displayName: z.string().trim().min(2).max(80).optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y guion bajo")
    .optional(),
  city: z.string().trim().min(1).max(80).optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  skillLevel: z.enum(["beginner", "intermediate", "advanced", "pro"]).nullable().optional(),
  preferredSport: z.enum(["tennis", "padel", "pickleball"]).nullable().optional(),
});

// ── deleteUserAccount ───────────────────────────────────────────────────
// Borrado duro vía Supabase Auth (cascade a profiles). Solo admin; no self ni
// otros admins. Motivo obligatorio para audit_log vía setAuditActor.
export async function deleteUserAccount(
  input: unknown,
): Promise<ActionResult<{ userId: string }>> {
  return runAction(DeleteUserSchema, input, async ({ userId, reason }) => {
    const adminId = await requireAdminUserId();
    if (adminId === userId) {
      throw new MpError(
        "ACCOUNT.CANNOT_DELETE_SELF",
        "No puedes eliminar tu propia cuenta desde admin.",
        400,
      );
    }
    const admin = await getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    const { data: target } = await admin
      .from("role_assignments")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .is("revoked_at", null)
      .maybeSingle();
    if (target) {
      throw new MpError(
        "ACCOUNT.CANNOT_DELETE_ADMIN",
        "No puedes eliminar a otro administrador. Revoca primero el rol admin.",
        400,
      );
    }

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      throw new MpError("ACCOUNT.DELETE_FAILED", error.message, 500);
    }

    void reason;
    revalidatePath("/dashboard/admin/admin-users");

    return { userId };
  });
}

const GetAdminUserDetailSchema = z.object({
  userId: UuidSchema,
});

// ── getAdminUserDetail ──────────────────────────────────────────────────
// Datos ampliados para el panel lateral (email, roles, finanzas lifetime, etc.).
export async function getAdminUserDetail(
  input: unknown,
): Promise<ActionResult<AdminUserDetail>> {
  return runAction(GetAdminUserDetailSchema, input, async ({ userId }) => {
    await requireAdminUserId();
    const detail = await loadAdminUserDetail(userId);
    if (!detail) {
      throw new MpError("ACCOUNT.NOT_FOUND", "Usuario no encontrado.", 404);
    }
    return detail;
  });
}

// ── updateUserProfileAdmin ──────────────────────────────────────────────
// Corrección manual de datos de perfil. Escribe audit_log vía tg_audit.
export async function updateUserProfileAdmin(
  input: unknown,
): Promise<ActionResult<{ userId: string }>> {
  return runAction(AdminProfileUpdateSchema, input, async (data) => {
    const adminId = await requireAdminUserId();
    const admin = await getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    const payload: TablesUpdate<"profiles"> = {};
    if (data.displayName !== undefined) payload.display_name = data.displayName;
    if (data.username !== undefined) payload.username = data.username;
    if (data.city !== undefined) payload.city = data.city;
    if (data.bio !== undefined) payload.bio = data.bio;
    if (data.phone !== undefined) payload.phone = data.phone;
    if (data.country !== undefined) payload.country = data.country;
    if (data.skillLevel !== undefined) payload.skill_level = data.skillLevel;
    if (data.preferredSport !== undefined) payload.preferred_sport = data.preferredSport;

    if (Object.keys(payload).length === 0) {
      throw new MpError("PROFILE.NOTHING_TO_UPDATE", "No enviaste campos para actualizar.", 400);
    }

    if (data.username !== undefined) {
      const { data: clash } = await admin
        .from("profiles")
        .select("id")
        .eq("username", data.username)
        .neq("id", data.userId)
        .maybeSingle();
      if (clash) {
        throw new MpError("PROFILE.USERNAME_TAKEN", "Ese username ya está en uso.", 409);
      }
    }

    const { error } = await admin.from("profiles").update(payload).eq("id", data.userId);
    if (error) {
      throw new MpError("PROFILE.UPDATE_FAILED", error.message, 400);
    }

    revalidatePath("/dashboard/admin/admin-users");
    return { userId: data.userId };
  });
}
