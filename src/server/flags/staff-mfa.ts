import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { STAFF_MFA_FLAG } from "@/lib/auth/mfa-policy";

const CACHE_TTL_MS = 30_000;
let cached: { at: number; enabled: boolean } | null = null;

/** Lee staff_mfa_required con service role (anon no pasa RLS de feature_flags). */
export async function isStaffMfaRequiredEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.enabled;

  const { data } = await getAdminClient()
    .from("feature_flags")
    .select("enabled_default")
    .eq("key", STAFF_MFA_FLAG)
    .maybeSingle();

  const enabled = Boolean(data && data.enabled_default === true);
  cached = { at: now, enabled };
  return enabled;
}

/** Invalida cache tras toggle admin del flag (tests / futuro panel). */
export function resetStaffMfaFlagCache(): void {
  cached = null;
}
