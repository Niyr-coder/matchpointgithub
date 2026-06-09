/**
 * Smoke check operativo pre-beta (lee DB directo).
 *
 *   npx tsx --env-file=.env.local scripts/check-beta-readiness.ts
 *
 * Opcional: APP_URL=https://staging.matchpoint.top para ping /api/health
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !service) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as any;

const BETA_FLAGS = [
  "club_giveaways_enabled",
  "club_marketing_enabled",
  "club_memberships_v2",
  "coach_ai_enabled",
  "signups_open",
  "read_only_mode",
] as const;

async function checkHealth(): Promise<void> {
  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    console.log("\n— /api/health: omitido (sin APP_URL)");
    return;
  }
  try {
    const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/health`);
    const body = await res.json();
    const ok = res.ok && body.ok;
    console.log(`\n— /api/health: ${ok ? "OK" : "FALLO"} (${res.status})`);
    console.log(JSON.stringify(body, null, 2));
  } catch (err) {
    console.log("\n— /api/health: error de red", err instanceof Error ? err.message : err);
  }
}

async function main() {
  console.log("=== Beta readiness ===\n");

  const { data: flags, error: flagErr } = await sb
    .from("feature_flags")
    .select("key,enabled_default")
    .in("key", [...BETA_FLAGS]);
  if (flagErr) throw new Error(flagErr.message);

  console.log("Flags (defaults globales):");
  for (const key of BETA_FLAGS) {
    const row = (flags ?? []).find((f: { key: string }) => f.key === key);
    if (!row) {
      console.log(`  ? ${key}: no existe en DB`);
    } else {
      console.log(`  ${row.enabled_default ? "ON " : "OFF"} ${key}`);
    }
  }

  const { data: pilots } = await sb
    .from("feature_flag_assignments")
    .select("flag_key,scope_id,enabled")
    .eq("scope", "club")
    .eq("enabled", true)
    .in("flag_key", ["club_giveaways_enabled", "club_marketing_enabled", "club_memberships_v2"]);

  const clubIds = Array.from(new Set((pilots ?? []).map((p: { scope_id: string }) => p.scope_id)));
  const clubMap = new Map<string, { slug: string; name: string }>();
  if (clubIds.length) {
    const { data: clubs } = await sb.from("clubs").select("id,slug,name").in("id", clubIds);
    for (const c of clubs ?? []) {
      clubMap.set(c.id as string, { slug: c.slug as string, name: c.name as string });
    }
  }

  console.log("\nExcepciones club piloto:");
  if (!pilots?.length) {
    console.log("  (ninguna — corre seed-beta-cohort.ts)");
  } else {
    for (const p of pilots) {
      const club = clubMap.get(p.scope_id as string);
      console.log(`  ${p.flag_key} → ${club?.name ?? p.scope_id} (${club?.slug ?? "?"})`);
    }
  }

  const now = new Date().toISOString();
  const { count: dueBroadcasts } = await sb
    .from("broadcasts")
    .select("id", { count: "exact", head: true })
    .eq("status", "scheduled")
    .lte("scheduled_for", now);

  const { count: pendingEmail } = await sb
    .from("notification_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("channel", "email");

  console.log("\nColas:");
  console.log(`  broadcasts scheduled vencidos: ${dueBroadcasts ?? 0}`);
  console.log(`  notification_jobs email pending: ${pendingEmail ?? 0}`);

  console.log("\nEnv crons:");
  console.log(`  CRON_SECRET: ${process.env.CRON_SECRET ? "set" : "FALTA"}`);
  console.log(`  RESEND_API_KEY: ${process.env.RESEND_API_KEY ? "set" : "FALTA"}`);

  await checkHealth();

  // Demo / QA isolation
  const { data: demoUsers } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const suspicious = (demoUsers?.users ?? []).filter((u: { email?: string }) => {
    const e = u.email ?? "";
    return (
      e.endsWith("@matchpoint.demo") ||
      e.endsWith("@matchpoint.test") ||
      /^e2e-/i.test(e)
    );
  });
  console.log(`\nCuentas demo/E2E en auth: ${suspicious.length}`);
  if (suspicious.length > 0 && process.env.NODE_ENV === "production") {
    console.warn("  ⚠ Revisa que no tengan roles de producción reales.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
