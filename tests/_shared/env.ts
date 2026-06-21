import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

export type TestEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  baseUrl: string;
};

export function getTestEnv(): TestEnv {
  const missing: string[] = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(
      `[tests] Faltan variables: ${missing.join(", ")}. Configura .env.local (ver tests/README.md).`,
    );
  }
  const baseUrl =
    process.env.MATCHPOINT_E2E_BASE_URL ??
    process.env.MATCHPOINT_TEST_BASE_URL ??
    "http://localhost:3000";
  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey, baseUrl };
}

export function getBaseUrlOnly(): string {
  return (
    process.env.MATCHPOINT_E2E_BASE_URL ??
    process.env.MATCHPOINT_TEST_BASE_URL ??
    "http://localhost:3000"
  );
}
