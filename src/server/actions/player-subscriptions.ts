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
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

// Precio por mes en centavos. USD 5/mes premium.
const PREMIUM_PRICE_CENTS_PER_MONTH = 500;

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  return user.id;
}

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
  return runAction(RequestUpgradeSchema, input, async ({ tier, durationMonths }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    // Rechazar si ya hay otra subscription pending para este user/tier.
    const { data: existingPending } = await supabase
      .from("player_subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("tier", tier)
      .eq("status", "pending")
      .maybeSingle();
    if (existingPending) {
      throw new MpError(
        "PLAN.PENDING_EXISTS",
        "Ya tienes una solicitud de upgrade pendiente para este plan",
        409,
      );
    }

    const amountCents = PREMIUM_PRICE_CENTS_PER_MONTH * durationMonths;

    // 1. Crear transaction pending_proof (sin club, kind 'plan').
    const { data: tx, error: txErr } = await supabase
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
    await requireAdminUserId();
    const supabase = await getServerClient();

    const { data: sub, error: readErr } = await supabase
      .from("player_subscriptions")
      .select("id,user_id,tier,status,duration_months,transaction_id")
      .eq("id", subscriptionId)
      .single();
    if (readErr || !sub) {
      throw new MpError("PLAN.SUB_NOT_FOUND", "Suscripcion no encontrada", 404);
    }
    if (sub.status !== "pending") {
      throw new MpError(
        "PLAN.INVALID_STATE",
        `Solo se aprueba desde 'pending' (actual: '${sub.status}')`,
        409,
      );
    }

    // Si el plan_expires_at actual del user está en el futuro, extendemos
    // desde ahí. Si no, arrancamos desde ahora.
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan_expires_at")
      .eq("id", sub.user_id as string)
      .single();
    const now = new Date();
    const currentExpiry = profile?.plan_expires_at
      ? new Date(profile.plan_expires_at as string)
      : null;
    const startsAt = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(startsAt);
    newExpiry.setMonth(newExpiry.getMonth() + (sub.duration_months as number));

    // 1. Activar la subscription.
    const { error: subUpdErr } = await supabase
      .from("player_subscriptions")
      .update({
        status: "active",
        starts_at: startsAt.toISOString(),
        expires_at: newExpiry.toISOString(),
        updated_at: now.toISOString(),
      } as never)
      .eq("id", subscriptionId);
    if (subUpdErr) {
      throw new MpError("PLAN.SUB_UPDATE_FAILED", subUpdErr.message, 500);
    }

    // 2. Actualizar profile.plan_tier y plan_expires_at.
    const { error: profUpdErr } = await supabase
      .from("profiles")
      .update({
        plan_tier: sub.tier,
        plan_expires_at: newExpiry.toISOString(),
      } as never)
      .eq("id", sub.user_id as string);
    if (profUpdErr) {
      throw new MpError("PLAN.PROFILE_UPDATE_FAILED", profUpdErr.message, 500);
    }

    // Welcome DM de premium activado. Fire-and-forget.
    try {
      const [{ getProfileSummary }, { sendSystemMessage, renderTemplate }] = await Promise.all([
        import("@/lib/auth/profile"),
        import("@/lib/messages/system"),
      ]);
      const profile = await getProfileSummary(sub.user_id as string);
      const firstName = (profile.displayName ?? "jugador").split(" ")[0];
      const expiresLabel = newExpiry.toLocaleDateString("es-EC", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      await sendSystemMessage({
        recipientUserId: sub.user_id as string,
        kind: "welcome_premium_activated",
        body: renderTemplate("welcome_premium_activated", {
          firstName,
          expiresAt: expiresLabel,
        }),
        payload: { subscriptionId, expiresAt: newExpiry.toISOString() },
      });
    } catch (e) {
      console.error("[approvePlanSubscriptionAdmin] welcome message failed", e);
    }

    return {
      subscriptionId,
      newTier: sub.tier as string,
      expiresAt: newExpiry.toISOString(),
    };
  });
}

// ── grantMatchPointPlusAdmin ───────────────────────────────────────────
// Atajo admin para activar MatchPoint+ directamente, sin pasar por el flujo
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
    // RLS de player_subscriptions/profiles bloquea al admin (solo el dueño
    // puede escribir). Después de validar rol con requireAdminUserId, usamos
    // service role para hacer el grant.
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");

    // Calcular nuevo expiry extendiendo desde el vigente.
    const { data: profile } = await admin
      .from("profiles")
      .select("plan_expires_at")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) {
      throw new MpError("PLAN.USER_NOT_FOUND", "Usuario no encontrado", 404);
    }
    const now = new Date();
    const currentExpiry = profile.plan_expires_at
      ? new Date(profile.plan_expires_at as string)
      : null;
    const startsAt = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(startsAt);
    newExpiry.setMonth(newExpiry.getMonth() + durationMonths);

    // Crear la subscription en estado 'active' directamente.
    const { data: sub, error: subErr } = await admin
      .from("player_subscriptions")
      .insert({
        user_id: userId,
        tier: "premium",
        status: "active",
        starts_at: startsAt.toISOString(),
        expires_at: newExpiry.toISOString(),
        duration_months: durationMonths,
        transaction_id: null,
        cancelled_reason: reason ?? null,
      } as never)
      .select("id")
      .single();
    if (subErr || !sub) {
      throw new MpError(
        "PLAN.SUB_CREATE_FAILED",
        subErr?.message ?? "No se pudo crear la suscripción",
        500,
      );
    }

    // Actualizar profile.
    const { error: profUpdErr } = await admin
      .from("profiles")
      .update({
        plan_tier: "premium",
        plan_expires_at: newExpiry.toISOString(),
      } as never)
      .eq("id", userId);
    if (profUpdErr) {
      throw new MpError("PLAN.PROFILE_UPDATE_FAILED", profUpdErr.message, 500);
    }

    // Audit log (best-effort).
    const { error: auditErr } = await admin.rpc("fn_admin_audit_log", {
      p_entity: "player_subscriptions",
      p_entity_id: sub.id as string,
      p_action: "plan_subscription.admin_grant",
      p_diff: {
        granted_to: userId,
        granted_by: adminId,
        duration_months: durationMonths,
        expires_at: newExpiry.toISOString(),
        reason: reason ?? null,
      } as never,
    });
    if (auditErr) {
      console.error("[grantMatchPointPlus] audit log failed", auditErr);
    }

    return {
      subscriptionId: sub.id as string,
      userId,
      expiresAt: newExpiry.toISOString(),
    };
  });
}

// ── revokeMatchPointPlusAdmin ──────────────────────────────────────────
// Quita MatchPoint+ inmediato: marca todas las subs activas del user como
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
      } as never,
    });
    if (auditErr) {
      console.error("[revokeMatchPointPlus] audit log failed", auditErr);
    }

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
