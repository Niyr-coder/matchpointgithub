// Admin / service-role Supabase client.
// BYPASSES RLS. Server-only. Use sparingly:
//   - notification dispatcher
//   - pg_cron-equivalent workers
//   - webhook handlers that need cross-tenant writes
//   - migrations / seed scripts
//   - SECURITY DEFINER helpers when called from app code
//
// NEVER import this from any file that may end up in a Client Component bundle.
import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { PUBLIC_SUPABASE_URL, getServiceRoleKey } from "./env";

let cached: ReturnType<typeof createClient<Database>> | null = null;

export function getAdminClient() {
  if (cached) return cached;
  cached = createClient<Database>(PUBLIC_SUPABASE_URL, getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
