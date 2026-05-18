// Per-request cached profile summary. Sirve para evitar que múltiples server
// components (layouts, screens) hagan cada uno su propio select a `profiles`
// en el mismo render. React.cache memoiza por (fn, args) dentro del ciclo de
// vida del request — entre requests no persiste, así que sigue siendo seguro
// para datos que cambian (plan, onboarding, display_name).
//
// Diferencia vs. el unstable_cache de `dashboard/layout.tsx` (gate de
// onboarding): aquel persiste en el data cache de Next y se invalida por tag;
// éste solo dedupea dentro de un único render. Ambos coexisten.
import "server-only";

import { cache } from "react";
import { getServerClient } from "@/lib/db/client.server";

export type PlanTier = "free" | "premium";

export type ProfileSummary = {
  id: string;
  displayName: string | null;
  username: string | null;
  city: string | null;
  avatarUrl: string | null;
  planTier: PlanTier;
  planExpiresAt: string | null;
  onboardedAt: string | null;
};

// Cuando el row no existe (caso borde entre signup y trigger), devolvemos un
// fallback "free / no onboardeado" para que los consumidores no tengan que
// chequear null. El id se conserva del input.
function emptySummary(userId: string): ProfileSummary {
  return {
    id: userId,
    displayName: null,
    username: null,
    city: null,
    avatarUrl: null,
    planTier: "free",
    planExpiresAt: null,
    onboardedAt: null,
  };
}

// React.cache: la fn se memoiza por (referencia, args) dentro de un render.
// Una sola query a profiles incluso si múltiples layers la piden con el mismo
// userId. No usar en route handlers fuera de un render (no aporta).
export const getProfileSummary = cache(async (userId: string): Promise<ProfileSummary> => {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id,display_name,username,city,avatar_url,plan_tier,plan_expires_at,onboarded_at")
    .eq("id", userId)
    .maybeSingle();

  if (!data) return emptySummary(userId);

  const rawTier = (data.plan_tier ?? "free") as string;
  const planTier: PlanTier = rawTier === "premium" ? "premium" : "free";

  return {
    id: (data.id as string) ?? userId,
    displayName: (data.display_name as string | null) ?? null,
    username: (data.username as string | null) ?? null,
    city: (data.city as string | null) ?? null,
    avatarUrl: (data.avatar_url as string | null) ?? null,
    planTier,
    planExpiresAt: (data.plan_expires_at as string | null) ?? null,
    onboardedAt: (data.onboarded_at as string | null) ?? null,
  };
});

// Helper para decidir si el plan premium sigue vigente sin tener que repetir
// la lógica en cada caller. Refleja el mismo criterio que getPlanForUser:
// premium con expiry futura (o null) ⇒ premium activo; cualquier otra cosa
// degrada a free.
export function isPlanActive(summary: ProfileSummary): { tier: PlanTier; active: boolean } {
  if (summary.planTier !== "premium") {
    return { tier: "free", active: true };
  }
  const stillValid =
    summary.planExpiresAt === null ||
    new Date(summary.planExpiresAt).getTime() > Date.now();
  return { tier: stillValid ? "premium" : "free", active: true };
}
