import "server-only";

import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import type { Json } from "@/lib/db/types";
import { MpError } from "@/lib/api/errors";
import { notify } from "@/server/notifications/dispatch";
import { isSignupAutoMpPlusEnabled } from "@/server/flags/signup-auto-mp-plus";

export const SIGNUP_MP_PLUS_DURATION_MONTHS = 1;

async function notifyPremiumActivated(args: {
  userId: string;
  subscriptionId: string;
  expiresAt: string;
  source: "payment" | "admin_grant" | "signup_grant";
}) {
  const expiresLabel = new Date(args.expiresAt).toLocaleDateString("es-EC", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  await notify({
    userId: args.userId,
    role: "user",
    kind: "mp_plus_activated",
    title: "MATCHPOINT+ activado",
    body: `Tu plan MATCHPOINT+ está activo hasta el ${expiresLabel}.`,
    payload: {
      subscriptionId: args.subscriptionId,
      expiresAt: args.expiresAt,
      source: args.source,
    },
  });
}

export async function grantMatchPointPlusInternal(args: {
  userId: string;
  durationMonths: number;
  reason: string | null;
  auditAction: string;
  actorId: string | null;
  actorRole: "admin" | "system";
  notifySource: "admin_grant" | "signup_grant";
}): Promise<{ subscriptionId: string; userId: string; expiresAt: string }> {
  const admin = getAdminClient();
  if (args.actorId) {
    await setAuditActor(admin, args.actorId, args.actorRole);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("plan_expires_at")
    .eq("id", args.userId)
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
  newExpiry.setMonth(newExpiry.getMonth() + args.durationMonths);

  const { data: sub, error: subErr } = await admin
    .from("player_subscriptions")
    .insert({
      user_id: args.userId,
      tier: "premium",
      status: "active",
      starts_at: startsAt.toISOString(),
      expires_at: newExpiry.toISOString(),
      duration_months: args.durationMonths,
      transaction_id: null,
      cancelled_reason: args.reason,
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

  const { error: profUpdErr } = await admin
    .from("profiles")
    .update({
      plan_tier: "premium",
      plan_expires_at: newExpiry.toISOString(),
    } as never)
    .eq("id", args.userId);
  if (profUpdErr) {
    throw new MpError("PLAN.PROFILE_UPDATE_FAILED", profUpdErr.message, 500);
  }

  const { error: auditErr } = await admin.rpc("fn_admin_audit_log", {
    p_entity: "player_subscriptions",
    p_entity_id: sub.id as string,
    p_action: args.auditAction,
    p_diff: {
      granted_to: args.userId,
      granted_by: args.actorId,
      duration_months: args.durationMonths,
      expires_at: newExpiry.toISOString(),
      reason: args.reason,
    } as Json,
  });
  if (auditErr) {
    console.error(
      `[grantMatchPointPlus] [ok=false] audit_log_failed (action=${args.auditAction}):`,
      auditErr.message,
    );
  }

  await notifyPremiumActivated({
    userId: args.userId,
    subscriptionId: sub.id as string,
    expiresAt: newExpiry.toISOString(),
    source: args.notifySource,
  });

  return {
    subscriptionId: sub.id as string,
    userId: args.userId,
    expiresAt: newExpiry.toISOString(),
  };
}

/** Otorga MATCHPOINT+ al registrarse si el flag global está activo. No lanza al caller. */
export async function tryGrantMatchPointPlusOnSignup(userId: string): Promise<void> {
  try {
    if (!(await isSignupAutoMpPlusEnabled())) return;

    const admin = getAdminClient();
    await setAuditActor(admin, userId, "system");

    await grantMatchPointPlusInternal({
      userId,
      durationMonths: SIGNUP_MP_PLUS_DURATION_MONTHS,
      reason: "Registro automático (flag signup_auto_mp_plus)",
      auditAction: "plan_subscription.signup_grant",
      actorId: null,
      actorRole: "system",
      notifySource: "signup_grant",
    });
  } catch (e) {
    console.error("[signup] auto MATCHPOINT+ grant failed", e);
  }
}
