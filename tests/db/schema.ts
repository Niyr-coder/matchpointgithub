/**
 * Database testing — invariantes de schema y datos críticos post-migración.
 */
import { createClient } from "@supabase/supabase-js";
import { getTestEnv } from "../_shared/env";
import { printSuite, type SuiteResult } from "../_shared/report";

export async function runDatabaseTests(): Promise<SuiteResult> {
  const env = getTestEnv();
  const start = Date.now();
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  const admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function check(name: string, fn: () => Promise<boolean>) {
    try {
      const ok = await fn();
      if (ok) {
        passed++;
        details.push(`OK ${name}`);
      } else {
        failed++;
        details.push(`FAIL ${name}`);
      }
    } catch (e) {
      failed++;
      details.push(`FAIL ${name} → ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await check("clubs.partner_link_code poblado", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("clubs")
      .select("id,partner_link_code")
      .limit(20);
    if (error) throw error;
    return (data ?? []).every(
      (r: { partner_link_code?: string }) =>
        typeof r.partner_link_code === "string" && r.partner_link_code.startsWith("CLB-"),
    );
  });

  await check("partner_link_code único (muestra)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).from("clubs").select("partner_link_code");
    if (error) throw error;
    const codes = (data ?? []).map((r) => r.partner_link_code as string);
    return new Set(codes).size === codes.length;
  });

  await check("tournament_categories.stage existe", async () => {
    const { error } = await admin.from("tournament_categories").select("id,stage").limit(1);
    return !error;
  });

  await check("tournament_categories.group_playoff_config existe", async () => {
    const { error } = await admin
      .from("tournament_categories")
      .select("id,group_playoff_config")
      .limit(1);
    return !error;
  });

  await check("tournament_group_matches.court_id + scheduled_at", async () => {
    const { error } = await admin
      .from("tournament_group_matches")
      .select("id,court_id,scheduled_at")
      .limit(1);
    return !error;
  });

  await check("registrations.category_id existe", async () => {
    const { error } = await admin.from("registrations").select("id,category_id").limit(1);
    return !error;
  });

  await check("RLS profiles legible con service role", async () => {
    const { data, error } = await admin.from("profiles").select("id").limit(1);
    return !error && Array.isArray(data);
  });

  return {
    suite: "schema-invariants",
    category: "Database",
    ok: failed === 0,
    durationMs: Date.now() - start,
    passed,
    failed,
    skipped: 0,
    details,
  };
}
