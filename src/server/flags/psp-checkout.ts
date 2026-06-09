import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { PSP_CHECKOUT_FLAG } from "@/lib/payments/constants";

const CACHE_TTL_MS = 30_000;
let cached: { at: number; enabled: boolean } | null = null;

export async function isPspCheckoutEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.enabled;

  const { data } = await getAdminClient()
    .from("feature_flags")
    .select("enabled_default")
    .eq("key", PSP_CHECKOUT_FLAG)
    .maybeSingle();

  const enabled = Boolean(data && data.enabled_default === true);
  cached = { at: now, enabled };
  return enabled;
}

export function resetPspCheckoutFlagCache(): void {
  cached = null;
}
