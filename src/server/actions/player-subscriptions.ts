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

    return {
      subscriptionId,
      newTier: sub.tier as string,
      expiresAt: newExpiry.toISOString(),
    };
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
