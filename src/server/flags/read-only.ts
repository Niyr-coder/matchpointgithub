import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { MpError } from "@/lib/api/errors";
import { userHasAdminRole } from "@/lib/auth/session";

export const READ_ONLY_FLAG = "read_only_mode";

const CACHE_TTL_MS = 30_000;
let cached: { at: number; enabled: boolean } | null = null;

export async function isReadOnlyModeEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.enabled;

  const { data } = await getAdminClient()
    .from("feature_flags")
    .select("enabled_default")
    .eq("key", READ_ONLY_FLAG)
    .maybeSingle();

  const enabled = Boolean(data && data.enabled_default === true);
  cached = { at: now, enabled };
  return enabled;
}

/** Bloquea mutaciones cuando read_only_mode está activo. Admins pueden bypass. */
export async function requireWritable(): Promise<void> {
  if (!(await isReadOnlyModeEnabled())) return;
  if (await userHasAdminRole()) return;

  throw new MpError(
    "FLAGS.READ_ONLY",
    "MATCHPOINT está en modo solo lectura. Intenta más tarde o escríbenos a soporte.",
    503,
  );
}
