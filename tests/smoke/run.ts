/**
 * Smoke tests — rutas públicas críticas responden sin 5xx.
 * Requiere dev server en MATCHPOINT_TEST_BASE_URL (default localhost:3000).
 */
import { getBaseUrlOnly } from "../_shared/env";
import { isDirectRun } from "../_shared/cli";
import { printSuite, type SuiteResult } from "../_shared/report";

async function fetchStatus(path: string): Promise<{ status: number; ok: boolean }> {
  const base = getBaseUrlOnly();
  const res = await fetch(`${base}${path}`, {
    redirect: "follow",
    headers: { Accept: "text/html,application/json" },
  });
  return { status: res.status, ok: res.status < 500 };
}

export async function runSmokeTests(): Promise<SuiteResult> {
  const start = Date.now();
  const routes = [
    "/",
    "/login",
    "/signup",
    "/precios",
    "/clubes",
    "/eventos",
    "/ranking",
    "/legal/privacidad",
    "/legal/terminos",
  ];
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  for (const route of routes) {
    try {
      const { status, ok } = await fetchStatus(route);
      if (ok && status < 400) {
        passed++;
        details.push(`OK ${route} → ${status}`);
      } else {
        failed++;
        details.push(`FAIL ${route} → ${status}`);
      }
    } catch (e) {
      failed++;
      details.push(`FAIL ${route} → ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    suite: "smoke-public-routes",
    category: "Smoke",
    ok: failed === 0,
    durationMs: Date.now() - start,
    passed,
    failed,
    skipped: 0,
    details,
  };
}

if (isDirectRun("smoke/run")) {
  runSmokeTests().then((r) => {
    printSuite(r);
    process.exit(r.ok ? 0 : 1);
  });
}
