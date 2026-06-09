"use server";

// Admin · activar / revocar plan de club (Slice 1 de MAT-70).
//
// Espejo de grantMatchPointPlusAdmin / revokeMatchPointPlusAdmin pero para
// clubes (mig 174). Hoy NO hay self-service de Club Pro — la activación pasa
// 100% por admin con comprobante manual (transferencia / DeUna) hasta que
// definamos PSP recurrente. Por eso solo expongo el path admin.
//
// Toda mutación pasa por service-role (getAdminClient + setAuditActor) porque
// las RLS de club_subscriptions/clubs son admin-only para escritura.

import "server-only";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import type { Json } from "@/lib/db/types";

const ClubPlanTierSchema = z.enum(["pro", "partner"]);

const GrantSchema = z.object({
  clubId: UuidSchema,
  tier: ClubPlanTierSchema,
  // partner suele ser indefinido (contrato custom). Si durationMonths es null,
  // el plan no expira hasta revocación explícita.
  durationMonths: z.number().int().min(1).max(60).nullable().default(1),
  reason: z.string().min(2).max(500).optional(),
});

const RevokeSchema = z.object({
  clubId: UuidSchema,
  reason: z.string().min(2).max(500),
});

export type GrantClubPlanResult = {
  subscriptionId: string;
  clubId: string;
  tier: "pro" | "partner";
  expiresAt: string | null;
};

// ── grantClubPlanAdmin ──────────────────────────────────────────────────
// Activa el plan inmediatamente. Si el club ya tenía un plan vigente del
// mismo tier o superior, extendemos desde su expiry; si está en starter o
// expirado, arrancamos desde ahora.
//
// Para partner con duración indefinida: pasar durationMonths=null.
export async function grantClubPlanAdmin(
  input: unknown,
): Promise<ActionResult<GrantClubPlanResult>> {
  return runAction(GrantSchema, input, async ({ clubId, tier, durationMonths, reason }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    // Buscar el plan actual para decidir si extendemos o arrancamos de cero.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: club } = await (admin as any)
      .from("clubs")
      .select("plan_tier, plan_expires_at")
      .eq("id", clubId)
      .maybeSingle();
    if (!club) {
      throw new MpError("CLUB_PLAN.CLUB_NOT_FOUND", "Club no encontrado", 404);
    }

    const now = new Date();
    const currentExpiry = club.plan_expires_at
      ? new Date(club.plan_expires_at as string)
      : null;
    // Solo extendemos si el club ya está en este tier (o superior) y vigente.
    // Si está en starter o en un tier diferente, arrancamos desde ahora.
    const sameOrHigher =
      club.plan_tier === tier ||
      (club.plan_tier === "partner" && tier === "pro");
    const startsAt = sameOrHigher && currentExpiry && currentExpiry > now
      ? currentExpiry
      : now;

    let newExpiry: Date | null;
    if (durationMonths == null) {
      // Vigencia indefinida (típico partner). No setea expires_at.
      newExpiry = null;
    } else {
      newExpiry = new Date(startsAt);
      newExpiry.setMonth(newExpiry.getMonth() + durationMonths);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sub, error: subErr } = await (admin as any)
      .from("club_subscriptions")
      .insert({
        club_id: clubId,
        tier,
        status: "active",
        starts_at: startsAt.toISOString(),
        expires_at: newExpiry ? newExpiry.toISOString() : null,
        duration_months: durationMonths ?? 1,
        transaction_id: null,
        granted_by: adminId,
        granted_reason: reason ?? null,
      })
      .select("id")
      .single();
    if (subErr || !sub) {
      throw new MpError(
        "CLUB_PLAN.SUB_CREATE_FAILED",
        subErr?.message ?? "No se pudo crear la suscripción",
        500,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: clubUpdErr } = await (admin as any)
      .from("clubs")
      .update({
        plan_tier: tier,
        plan_expires_at: newExpiry ? newExpiry.toISOString() : null,
      })
      .eq("id", clubId);
    if (clubUpdErr) {
      throw new MpError("CLUB_PLAN.CLUB_UPDATE_FAILED", clubUpdErr.message, 500);
    }

    const { error: auditErr } = await admin.rpc("fn_admin_audit_log", {
      p_entity: "club_subscriptions",
      p_entity_id: sub.id as string,
      p_action: "club_plan.admin_grant",
      p_diff: {
        club_id: clubId,
        tier,
        granted_by: adminId,
        duration_months: durationMonths,
        expires_at: newExpiry ? newExpiry.toISOString() : null,
        reason: reason ?? null,
      } as Json,
    });
    if (auditErr) {
      console.error(
        "[grantClubPlan] audit_log_failed:",
        auditErr.message,
      );
    }

    revalidatePath("/dashboard/admin/admin-clubs");

    return {
      subscriptionId: sub.id as string,
      clubId,
      tier,
      expiresAt: newExpiry ? newExpiry.toISOString() : null,
    };
  });
}

// ── revokeClubPlanAdmin ─────────────────────────────────────────────────
// Baja inmediata: cancela todas las subs activas y vuelve el club a starter.
// Útil para cierres de contrato, falta de pago, o testing.
export async function revokeClubPlanAdmin(
  input: unknown,
): Promise<ActionResult<{ clubId: string; cancelledCount: number }>> {
  return runAction(RevokeSchema, input, async ({ clubId, reason }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cancelled, error: subErr } = await (admin as any)
      .from("club_subscriptions")
      .update({
        status: "cancelled",
        cancelled_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("club_id", clubId)
      .eq("status", "active")
      .select("id");
    if (subErr) {
      throw new MpError("CLUB_PLAN.REVOKE_FAILED", subErr.message, 500);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: clubUpdErr } = await (admin as any)
      .from("clubs")
      .update({ plan_tier: "starter", plan_expires_at: null })
      .eq("id", clubId);
    if (clubUpdErr) {
      throw new MpError("CLUB_PLAN.CLUB_UPDATE_FAILED", clubUpdErr.message, 500);
    }

    const { error: auditErr } = await admin.rpc("fn_admin_audit_log", {
      p_entity: "clubs",
      p_entity_id: clubId,
      p_action: "club_plan.admin_revoke",
      p_diff: {
        revoked_by: adminId,
        reason,
        cancelled_subs: cancelled?.length ?? 0,
      } as Json,
    });
    if (auditErr) {
      console.error("[revokeClubPlan] audit_log_failed:", auditErr.message);
    }

    revalidatePath("/dashboard/admin/admin-clubs");

    return {
      clubId,
      cancelledCount: cancelled?.length ?? 0,
    };
  });
}
