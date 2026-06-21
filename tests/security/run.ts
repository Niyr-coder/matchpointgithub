/**
 * Security + concurrency + resilience — superficie pública y auth boundaries.
 */
import { getBaseUrlOnly, getTestEnv } from "../_shared/env";
import { printSuite, type SuiteResult } from "../_shared/report";

export async function runSecurityTests(): Promise<SuiteResult> {
  getTestEnv();
  const base = getBaseUrlOnly();
  const start = Date.now();
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

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

  await check("Security: /api/v1/me sin cookie → 401", async () => {
    const res = await fetch(`${base}/api/v1/me`);
    return res.status === 401;
  });

  await check("Security: /api/v1/admin/flags sin auth → no 200", async () => {
    const res = await fetch(`${base}/api/v1/admin/flags`);
    return res.status !== 200;
  });

  await check("Security: path traversal en slug → no 500", async () => {
    const res = await fetch(`${base}/api/v1/clubs/${encodeURIComponent("../../../etc/passwd")}`);
    return res.status < 500;
  });

  await check("Resilience: método PATCH no soportado → no 500", async () => {
    const res = await fetch(`${base}/api/v1/clubs`, { method: "PATCH" });
    return res.status < 500;
  });

  await check("Concurrency: 20 requests paralelos /api/v1/tournaments?page=1", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        fetch(`${base}/api/v1/tournaments?page=1&pageSize=5`).then((r) => r.status),
      ),
    );
    const okCount = results.filter((s) => s === 200).length;
    return okCount >= 18;
  });

  await check("Regression: HTML landing no expone service role", async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    return !html.includes("SUPABASE_SERVICE_ROLE") && !html.includes("service_role");
  });

  return {
    suite: "security-resilience",
    category: "Security / Concurrency",
    ok: failed === 0,
    durationMs: Date.now() - start,
    passed,
    failed,
    skipped: 0,
    details,
  };
}
