// Service-role Supabase client para setup/seed/dump SQL desde el runner.
// Sólo se usa en helpers de test — nunca exponer la service role al cliente.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequiredEnv } from "./env";

let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const env = getRequiredEnv();
  cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
