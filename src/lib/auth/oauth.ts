// Helpers compartidos para OAuth (Google, etc.). Usados por server actions y
// el route handler /auth/callback.
import "server-only";

import type { User } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/db/client.admin";

/** Feature flag signups_open — off explícito = cerrado. */
export async function areSignupsClosed(): Promise<boolean> {
  const { data: signupsFlag } = await getAdminClient()
    .from("feature_flags")
    .select("enabled_default")
    .eq("key", "signups_open")
    .maybeSingle();
  return Boolean(signupsFlag && signupsFlag.enabled_default === false);
}

/** Usuario recién creado vía OAuth (auto-signup de Supabase). */
export function isRecentlyCreatedUser(user: User, windowMs = 120_000): boolean {
  const created = new Date(user.created_at).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < windowMs;
}

export function safeOAuthNext(raw: string | null, fallback = "/dashboard/user"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

export function buildPostAuthRedirect(next: string, needsOnboarding: boolean): string {
  if (needsOnboarding) {
    return `/onboarding?next=${encodeURIComponent(next)}`;
  }
  return next;
}
