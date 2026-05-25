// Plan tier helpers para CLUBES (mig 174). Espejo de plan.ts (que es para
// jugadores). Lee clubs.plan_tier + plan_expires_at y expone gating reutilizable
// para Server Actions que actúan sobre un club específico.
//
// Reglas:
// - 'starter' es el plan por defecto y siempre se considera activo (es free).
// - 'pro' / 'partner' solo son efectivos si plan_expires_at IS NULL (vigencia
//   indefinida, ej. partner con contrato) o plan_expires_at > now().
// - Si el club no existe o no tiene fila, asumimos 'starter' (degradación segura).
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { MpError } from "@/lib/api/errors";

export type ClubPlanTier = "starter" | "pro" | "partner";

export type ClubPlanStatus = {
  tier: ClubPlanTier;
  expiresAt: string | null;
  active: boolean;
};

// Orden de capacidades: pro y partner ambos cubren todo lo que cubre starter.
// partner > pro porque partner tiene multi-club; pro NO. Si necesitamos requerir
// "al menos pro" eso incluye partner.
const TIER_RANK: Record<ClubPlanTier, number> = {
  starter: 0,
  pro: 1,
  partner: 2,
};

type TypedClient = SupabaseClient<Database>;

export async function getPlanForClub(
  supabase: TypedClient,
  clubId: string,
): Promise<ClubPlanStatus> {
  // TODO: regenerar src/lib/db/types.ts para que clubs.plan_tier tipee.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("clubs")
    .select("plan_tier, plan_expires_at")
    .eq("id", clubId)
    .maybeSingle();

  if (error) {
    throw new MpError("CLUB_PLAN.LOOKUP_FAILED", error.message, 500);
  }

  if (!data) {
    return { tier: "starter", expiresAt: null, active: true };
  }

  const rawTier = ((data.plan_tier as string) ?? "starter") as ClubPlanTier;
  const expiresAt = (data.plan_expires_at as string | null) ?? null;

  if (rawTier !== "starter") {
    const stillValid = expiresAt === null || new Date(expiresAt).getTime() > Date.now();
    if (stillValid) {
      return { tier: rawTier, expiresAt, active: true };
    }
    // Plan expirado: efectivo es starter. El cron lo normaliza, pero el helper
    // refleja el efectivo aun si el cron no ha corrido.
    return { tier: "starter", expiresAt, active: true };
  }

  return { tier: "starter", expiresAt, active: true };
}

// Lanza CLUB_PLAN.UPGRADE_REQUIRED (402) si el plan efectivo del club no
// alcanza al mínimo requerido. Devuelve el ClubPlanStatus si pasa.
export async function requireClubPlan(
  supabase: TypedClient,
  clubId: string,
  minTier: ClubPlanTier,
): Promise<ClubPlanStatus> {
  const plan = await getPlanForClub(supabase, clubId);
  if (TIER_RANK[plan.tier] < TIER_RANK[minTier]) {
    throw new MpError(
      "CLUB_PLAN.UPGRADE_REQUIRED",
      minTier === "pro"
        ? "Esta acción requiere plan Club Pro."
        : "Esta acción requiere un plan de club superior.",
      402,
    );
  }
  return plan;
}

// Gate condicional por feature flag. Si el flag está OFF, no se aplica gating
// (comportamiento gratuito). Si está ON, se aplica requireClubPlan.
//
// Diseñado para los flags `paywall_enforce_<feature>` de club: la posición
// segura es OFF, admin la flipea cuando decide activar el paywall del club.
//
// Uso típico:
//   await requireClubPlanWithFlag(
//     supabase, clubId, "paywall_enforce_club_court_cap", "pro",
//   );
export async function requireClubPlanWithFlag(
  supabase: TypedClient,
  clubId: string,
  flagKey: string,
  minTier: ClubPlanTier,
): Promise<ClubPlanStatus> {
  const { isPaywallFlagEnabled } = await import("./plan");
  const enforced = await isPaywallFlagEnabled(supabase, flagKey);
  if (!enforced) {
    return getPlanForClub(supabase, clubId);
  }
  return requireClubPlan(supabase, clubId, minTier);
}
