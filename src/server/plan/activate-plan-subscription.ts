import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Json } from "@/lib/db/types";
import { MpError } from "@/lib/api/errors";
import { notify } from "@/server/notifications/dispatch";

type AdminClient = SupabaseClient<Database>;

/**
 * Activa una player_subscription en estado 'pending' usando el admin client
 * ya disponible en el caller. Centraliza la lógica compartida entre
 * approvePlanSubscriptionAdmin (flujo manual) y capture-cascade (flujo automático
 * de pago). No hace auth check — el caller es responsable de eso.
 */
export async function activatePendingPlanSubscriptionInternal(
  admin: AdminClient,
  subscriptionId: string,
): Promise<{ subscriptionId: string; newTier: string; expiresAt: string; userId: string }> {
  const { data: sub, error: readErr } = await admin
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

  const { data: profile } = await admin
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

  const { error: subUpdErr } = await admin
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

  const { error: profUpdErr } = await admin
    .from("profiles")
    .update({
      plan_tier: sub.tier,
      plan_expires_at: newExpiry.toISOString(),
    } as never)
    .eq("id", sub.user_id as string);
  if (profUpdErr) {
    throw new MpError("PLAN.PROFILE_UPDATE_FAILED", profUpdErr.message, 500);
  }

  const expiresLabel = newExpiry.toLocaleDateString("es-EC", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Welcome DM. Fire-and-forget: no bloquea ni propaga errores.
  try {
    const [{ getProfileSummary }, { sendSystemMessage, renderTemplate }] = await Promise.all([
      import("@/lib/auth/profile"),
      import("@/lib/messages/system"),
    ]);
    const userProfile = await getProfileSummary(sub.user_id as string);
    const firstName = (userProfile.displayName ?? "jugador").split(" ")[0];
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
    console.error("[activatePendingPlanSubscription] welcome_dm_failed", e);
  }

  await notify({
    userId: sub.user_id as string,
    role: "user",
    kind: "mp_plus_activated",
    title: "MATCHPOINT+ activado",
    body: `Tu plan MATCHPOINT+ está activo hasta el ${expiresLabel}.`,
    payload: {
      subscriptionId,
      expiresAt: newExpiry.toISOString(),
      source: "payment",
    },
  });

  const { error: auditErr } = await admin.rpc("fn_admin_audit_log", {
    p_entity: "player_subscriptions",
    p_entity_id: subscriptionId,
    p_action: "plan_subscription.admin_approve",
    p_diff: {
      tier: sub.tier,
      durationMonths: sub.duration_months,
      expiresAt: newExpiry.toISOString(),
    } as Json,
  });
  if (auditErr) {
    console.error("[activatePendingPlanSubscription] audit_log_failed:", auditErr.message);
  }

  return {
    subscriptionId,
    newTier: sub.tier as string,
    expiresAt: newExpiry.toISOString(),
    userId: sub.user_id as string,
  };
}
