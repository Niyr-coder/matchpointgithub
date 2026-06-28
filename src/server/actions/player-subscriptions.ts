"use server";

// Acciones de upgrade de plan de jugador (free → premium).
// Reusa el flujo de comprobantes del Agente F: el upgrade crea una
// transactions en pending_proof + player_subscriptions en pending.
// Cuando el admin aprueba el comprobante (approvePlanSubscriptionAdmin),
// la subscription pasa a active y profiles.plan_tier/expires_at se
// actualizan.

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, runMutation, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { requireAdminUserId, requireUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import type { Json } from "@/lib/db/types";
import { notify } from "@/server/notifications/dispatch";
import { grantMatchPointPlusInternal } from "@/server/plan/grant-matchpoint-plus";
import { activatePendingPlanSubscriptionInternal } from "@/server/plan/activate-plan-subscription";

// Precio por mes en centavos. MATCHPOINT+ = USD 6.99/mes.
const PREMIUM_PRICE_CENTS_PER_MONTH = 699;

// ── requestPlanUpgrade ─────────────────────────────────────────────────
const RequestUpgradeSchema = z.object({
  tier: z.enum(["premium"]),
  durationMonths: z.number().int().min(1).max(12).default(1),
});

export type PlanUpgradeResult = {
  subscriptionId: string;
  transactionId: string;
  amountCents: number;
};

export async function requestPlanUpgrade(
  input: unknown,
): Promise<ActionResult<PlanUpgradeResult>> {
  return runMutation(RequestUpgradeSchema, input, async ({ tier, durationMonths }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    // Rechazar si ya hay otra subscription pending para este user/tier.
    const { data: existingPending } = await supabase
      .from("player_subscriptions")
      .select("id,transaction_id")
      .eq("user_id", userId)
      .eq("tier", tier)
      .eq("status", "pending")
      .maybeSingle();
    if (existingPending) {
      const pendingTxId = (existingPending.transaction_id as string | null) ?? null;
      throw new MpError(
        "PLAN.PENDING_EXISTS",
        pendingTxId
          ? "Ya tienes una solicitud pendiente. Sube el comprobante para completarla."
          : "Ya tienes una solicitud de upgrade pendiente para este plan",
        409,
        pendingTxId ? { transactionId: [pendingTxId] } : undefined,
      );
    }

    const amountCents = PREMIUM_PRICE_CENTS_PER_MONTH * durationMonths;

    // 1. Crear transaction pending_proof (sin club, kind 'plan').
    // Usa admin client: RLS bloquea INSERT en transactions con club_id=null.
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "user");
    const { data: tx, error: txErr } = await admin
      .from("transactions")
      .insert({
        club_id: null,
        kind: "plan",
        ref_id: null,
        customer_user_id: userId,
        amount_cents: amountCents,
        currency: "USD",
        method: "transfer",
        status: "pending_proof",
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (txErr || !tx) {
      throw new MpError(
        "PLAN.TX_CREATE_FAILED",
        txErr?.message ?? "No se pudo crear la transaccion",
        500,
      );
    }
    const transactionId = tx.id as string;

    // 2. Crear subscription pending vinculada a la transaction.
    const { data: sub, error: subErr } = await supabase
      .from("player_subscriptions")
      .insert({
        user_id: userId,
        tier,
        status: "pending",
        duration_months: durationMonths,
        transaction_id: transactionId,
      } as never)
      .select("id")
      .single();
    if (subErr || !sub) {
      throw new MpError(
        "PLAN.SUB_CREATE_FAILED",
        subErr?.message ?? "No se pudo crear la suscripcion",
        500,
      );
    }

    return {
      subscriptionId: sub.id as string,
      transactionId,
      amountCents,
    };
  });
}

// ── approvePlanSubscriptionAdmin ───────────────────────────────────────
// Admin aprueba el comprobante: activa la subscription, actualiza
// profiles.plan_tier y plan_expires_at. La transaction ya debe estar en
// estado captured (lo hace approvePaymentProofAdmin antes de llamar esto)
// o la marcamos nosotros aquí.
const ApproveSchema = z.object({
  subscriptionId: UuidSchema,
});

export async function approvePlanSubscriptionAdmin(
  input: unknown,
): Promise<ActionResult<{ subscriptionId: string; newTier: string; expiresAt: string }>> {
  return runAction(ApproveSchema, input, async ({ subscriptionId }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    const { userId: _userId, ...result } = await activatePendingPlanSubscriptionInternal(
      admin,
      subscriptionId,
    );
    return result;
  });
}

// ── cancelMyPlan ───────────────────────────────────────────────────────
// Cancela la suscripción premium activa del propio user. Mantiene los
// beneficios hasta expires_at (no se borra profile.plan_tier acá; un cron
// futuro lo flippa cuando llegue la fecha). El user puede re-suscribirse
// cuando quiera vía requestPlanUpgrade.
const CancelMyPlanSchema = z.object({
  subscriptionId: UuidSchema,
  reason: z.string().min(2).max(500).optional(),
});

export async function cancelMyPlan(
  input: unknown,
): Promise<ActionResult<{ subscriptionId: string }>> {
  return runMutation(CancelMyPlanSchema, input, async ({ subscriptionId, reason }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    // Verificar que la sub existe, pertenece al user y está activa.
    const { data: sub } = await supabase
      .from("player_subscriptions")
      .select("id,user_id,status")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (!sub || sub.user_id !== userId) {
      throw new MpError("PLAN.SUB_NOT_FOUND", "Suscripción no encontrada", 404);
    }
    if (sub.status !== "active") {
      throw new MpError(
        "PLAN.INVALID_STATE",
        `Solo se cancela desde 'active' (actual: '${sub.status}')`,
        409,
      );
    }

    const admin = getAdminClient();
    await setAuditActor(admin, userId, "user");

    const { error: updErr } = await admin
      .from("player_subscriptions")
      .update({
        status: "cancelled",
        cancelled_reason: reason ?? "Cancelado por el usuario",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", subscriptionId);
    if (updErr) {
      throw new MpError("PLAN.SUB_UPDATE_FAILED", updErr.message, 500);
    }

    return { subscriptionId };
  });
}

// ── grantMatchPointPlusAdmin ───────────────────────────────────────────
// Atajo admin para activar MATCHPOINT+ directamente, sin pasar por el flujo
// de comprobantes. Útil para regalos, soporte, beta testers, recompensas.
// Crea una subscription con status='active' inmediato y extiende
// plan_expires_at desde el expiry vigente (o desde ahora si no había).
//
// La transacción asociada es opcional: si admin pasa transactionId, se
// vincula (caso: admin marcó como cobrado en efectivo fuera de la app).
// Si no, se deja transaction_id NULL.
const GrantSchema = z.object({
  userId: UuidSchema,
  durationMonths: z.number().int().min(1).max(36).default(1),
  reason: z.string().min(2).max(500).optional(),
});

export async function grantMatchPointPlusAdmin(
  input: unknown,
): Promise<ActionResult<{ subscriptionId: string; userId: string; expiresAt: string }>> {
  return runAction(GrantSchema, input, async ({ userId, durationMonths, reason }) => {
    const adminId = await requireAdminUserId();
    const result = await grantMatchPointPlusInternal({
      userId,
      durationMonths,
      reason: reason ?? null,
      auditAction: "plan_subscription.admin_grant",
      actorId: adminId,
      actorRole: "admin",
      notifySource: "admin_grant",
    });
    return result;
  });
}

// ── revokeMatchPointPlusAdmin ──────────────────────────────────────────
// Quita MATCHPOINT+ inmediato: marca todas las subs activas del user como
// cancelled y resetea profile a free. Útil para soporte/banear.
const RevokeSchema = z.object({
  userId: UuidSchema,
  reason: z.string().min(2).max(500),
});

export async function revokeMatchPointPlusAdmin(
  input: unknown,
): Promise<ActionResult<{ userId: string; cancelledCount: number }>> {
  return runAction(RevokeSchema, input, async ({ userId, reason }) => {
    const adminId = await requireAdminUserId();
    // Mismo motivo que grant: RLS bloquea admin.
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    const { data: cancelled, error: subErr } = await admin
      .from("player_subscriptions")
      .update({
        status: "cancelled",
        cancelled_reason: reason,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("id");
    if (subErr) {
      throw new MpError("PLAN.REVOKE_FAILED", subErr.message, 500);
    }

    const { error: profUpdErr } = await admin
      .from("profiles")
      .update({ plan_tier: "free", plan_expires_at: null } as never)
      .eq("id", userId);
    if (profUpdErr) {
      throw new MpError("PLAN.PROFILE_UPDATE_FAILED", profUpdErr.message, 500);
    }

    const { error: auditErr } = await admin.rpc("fn_admin_audit_log", {
      p_entity: "profiles",
      p_entity_id: userId,
      p_action: "plan_subscription.admin_revoke",
      p_diff: {
        revoked_by: adminId,
        reason,
        cancelled_subs: cancelled?.length ?? 0,
      } as Json,
    });
    if (auditErr) {
      console.error(
        "[revokeMatchPointPlus] [ok=false] audit_log_failed (action=plan_subscription.admin_revoke):",
        auditErr.message,
      );
    }

    await notify({
      userId,
      role: "user",
      kind: "mp_plus_revoked",
      title: "MATCHPOINT+ fue desactivado",
      body: "Tu plan MATCHPOINT+ fue desactivado por soporte. Si crees que es un error, contacta a soporte.",
      payload: {
        reason,
        cancelledCount: cancelled?.length ?? 0,
      },
    });

    return { userId, cancelledCount: cancelled?.length ?? 0 };
  });
}

// ── getCurrentPlan ─────────────────────────────────────────────────────
// Retorna el plan vigente del user logueado (mas un boolean active).
export async function getCurrentPlan(): Promise<
  ActionResult<{ tier: string; expiresAt: string | null; active: boolean }>
> {
  return runAction(z.object({}), {}, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("plan_tier,plan_expires_at")
      .eq("id", userId)
      .single();
    if (error || !data) throw new MpError("PROFILE.NOT_FOUND", "Perfil no encontrado", 404);
    const expiresAt = (data.plan_expires_at as string | null) ?? null;
    const tier = (data.plan_tier as string) ?? "free";
    const active =
      tier === "free" || (expiresAt != null && new Date(expiresAt) > new Date());
    return { tier, expiresAt, active };
  });
}
