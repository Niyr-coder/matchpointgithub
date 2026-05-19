// Team caps derivados del plan del captain. Lee platform_config.team_caps
// (migration 102) vía RPC fn_get_team_caps. Cached per request con React.cache.
//
// pendingInvitesMax = null significa ilimitado (premium).
// Ver docs/product/00-matchpoint-plus.md §Teams y migration 102_team_caps.sql.
import "server-only";

import { cache } from "react";
import { getServerClient } from "@/lib/db/client.server";
import { isPlanActive, type ProfileSummary } from "@/lib/auth/profile";

export type TeamCaps = {
  rosterMax: number;
  pendingInvitesMax: number | null; // null => ilimitado
  renamesMax: number;
};

type CapsConfig = {
  free: TeamCaps;
  premium: TeamCaps;
};

// Fallback hardcoded en caso de fallo del fetch o platform_config vacío.
// Misma forma que el seed de migration 102. Si lo cambias acá, cambia allá.
const FALLBACK_CAPS: CapsConfig = {
  free: { rosterMax: 12, pendingInvitesMax: 3, renamesMax: 2 },
  premium: { rosterMax: 24, pendingInvitesMax: null, renamesMax: 5 },
};

// Lectura cached per render. Múltiples actions del mismo request que
// validen caps comparten la misma query a platform_config.
const fetchCapsConfig = cache(async (): Promise<CapsConfig> => {
  const supabase = await getServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("fn_get_team_caps");
  if (error || !data) return FALLBACK_CAPS;
  const cfg = data as CapsConfig;
  return {
    free: { ...FALLBACK_CAPS.free, ...cfg.free },
    premium: { ...FALLBACK_CAPS.premium, ...cfg.premium },
  };
});

// API principal: dado el perfil del captain, devolver sus caps efectivos.
// Usa isPlanActive para que la lógica de "premium expirado degrada a free"
// quede consistente con el resto del producto.
export async function getTeamCaps(captainProfile: ProfileSummary): Promise<TeamCaps> {
  const cfg = await fetchCapsConfig();
  const { tier } = isPlanActive(captainProfile);
  return tier === "premium" ? cfg.premium : cfg.free;
}

// Helper para chequear si una cantidad excede el cap. Null = ilimitado.
export function exceedsCap(currentCount: number, cap: number | null): boolean {
  if (cap === null) return false;
  return currentCount >= cap;
}
