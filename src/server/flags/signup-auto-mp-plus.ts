import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";

export const SIGNUP_AUTO_MP_PLUS_FLAG = "signup_auto_mp_plus";

const CACHE_TTL_MS = 30_000;
let cached: { at: number; enabled: boolean } | null = null;

/** Flag global: cada registro nuevo recibe MATCHPOINT+ automáticamente. */
export async function isSignupAutoMpPlusEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.enabled;

  const { data } = await getAdminClient()
    .from("feature_flags")
    .select("enabled_default")
    .eq("key", SIGNUP_AUTO_MP_PLUS_FLAG)
    .maybeSingle();

  const enabled = Boolean(data && data.enabled_default === true);
  cached = { at: now, enabled };
  return enabled;
}
