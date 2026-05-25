// Plan tier helpers. Reads profiles.plan_tier + plan_expires_at and exposes
// reusable gating for Server Actions.
//
// Reglas:
// - 'free' es el plan por defecto y siempre se considera activo.
// - 'premium' solo es efectivo si plan_expires_at IS NULL (vigencia indefinida)
//   o plan_expires_at > now(). Si expiró, el plan efectivo es 'free'.
// - Si el user no tiene fila en profiles, asumimos 'free' (degradación segura).
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { MpError } from "@/lib/api/errors";

export type PlanTier = "free" | "premium";

export type PlanStatus = {
  tier: PlanTier;
  expiresAt: string | null;
  active: boolean;
};

const TIER_RANK: Record<PlanTier, number> = { free: 0, premium: 1 };

type TypedClient = SupabaseClient<Database>;

export async function getPlanForUser(
  supabase: TypedClient,
  userId: string,
): Promise<PlanStatus> {
  const { data, error } = await supabase
    .from("profiles")
    .select("plan_tier, plan_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new MpError("PLAN.LOOKUP_FAILED", error.message, 500);
  }

  // Sin fila en profiles → tratamos al user como Free (no bloqueamos por datos faltantes).
  if (!data) {
    return { tier: "free", expiresAt: null, active: true };
  }

  const rawTier = (data.plan_tier ?? "free") as PlanTier;
  const expiresAt = data.plan_expires_at ?? null;

  if (rawTier === "premium") {
    const stillValid = expiresAt === null || new Date(expiresAt).getTime() > Date.now();
    if (stillValid) {
      return { tier: "premium", expiresAt, active: true };
    }
    // Premium expirado: el plan efectivo es Free.
    return { tier: "free", expiresAt, active: true };
  }

  return { tier: "free", expiresAt, active: true };
}

export async function requirePlan(
  supabase: TypedClient,
  userId: string,
  minTier: PlanTier,
): Promise<PlanStatus> {
  const plan = await getPlanForUser(supabase, userId);
  if (TIER_RANK[plan.tier] < TIER_RANK[minTier]) {
    throw new MpError(
      "PLAN.UPGRADE_REQUIRED",
      "Esta acción requiere plan Premium",
      402,
    );
  }
  return plan;
}

// Gate condicional por feature flag. Si el flag está OFF, la acción procede
// sin gating (comportamiento gratuito). Si está ON, se aplica requirePlan.
//
// Diseñado para los flags `paywall_enforce_<feature>` (mig 172): la posición
// segura es OFF (no enforce), y admin la flipea cuando decide activar el paywall.
//
// El resolver respeta overrides por user/club/role vía fn_my_effective_flags
// (mig 027), así que se puede hacer rollout gradual sin tocar código.
//
// Uso típico:
//   await requirePlanWithFlag(supabase, userId, "paywall_enforce_coach_ai", "premium");
export async function requirePlanWithFlag(
  supabase: TypedClient,
  userId: string,
  flagKey: string,
  minTier: PlanTier,
): Promise<PlanStatus> {
  const enforced = await isPaywallFlagEnabled(supabase, flagKey);
  if (!enforced) {
    // Flag off → no gate. Devolvemos el plan real para callers que lo quieran inspeccionar.
    return getPlanForUser(supabase, userId);
  }
  return requirePlan(supabase, userId, minTier);
}

// Resuelve si un flag está efectivamente encendido para el usuario actual,
// respetando overrides por user/club/role. Usa el RPC fn_my_effective_flags
// que ya implementa esa jerarquía.
//
// Si el flag no existe en DB, devuelve false (paywall NO se aplica — fail open
// para que el código no rompa por flag faltante).
export async function isPaywallFlagEnabled(
  supabase: TypedClient,
  flagKey: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("fn_my_effective_flags");
  if (error) {
    // Si el resolver falla, fail open: no aplicar paywall.
    // El admin verá el error en el dashboard de paywall_events si registra el evento.
    return false;
  }
  const row = (data ?? []).find((r) => r.key === flagKey);
  return Boolean(row?.enabled);
}
