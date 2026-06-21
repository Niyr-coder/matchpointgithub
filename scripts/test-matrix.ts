/**
 * Orquestador de la matriz de testing MATCHPOINT.
 *
 * Uso:
 *   npm run test:matrix              # todo excepto E2E
 *   npm run test:matrix -- --e2e     # incluye Playwright
 *   npm run test:matrix -- --quick   # solo sanity + unit
 */
import { execSync } from "node:child_process";
import { printSummary, printSuite, type SuiteResult } from "../tests/_shared/report";
import { runContractTests } from "../tests/contract/openapi";
import { runDatabaseTests } from "../tests/db/schema";
import { runIntegrationTests } from "../tests/integration/api";
import { runLoadTests } from "../tests/load/run";
import { runSanityTests } from "../tests/regression/sanity";
import { runSecurityTests } from "../tests/security/run";
import { runSmokeTests } from "../tests/smoke/run";

const args = new Set(process.argv.slice(2));
const withE2e = args.has("--e2e");
const quick = args.has("--quick");

async function runUnit(): Promise<SuiteResult> {
  const start = Date.now();
  try {
    execSync("npx vitest run", { stdio: "pipe", cwd: process.cwd() });
    return {
      suite: "vitest-unit",
      category: "Unit",
      ok: true,
      durationMs: Date.now() - start,
      passed: 1,
      failed: 0,
      skipped: 0,
      details: ["OK vitest run"],
    };
  } catch (e) {
    const out = e instanceof Error && "stdout" in e ? String((e as { stdout?: Buffer }).stdout ?? "") : "";
    return {
      suite: "vitest-unit",
      category: "Unit",
      ok: false,
      durationMs: Date.now() - start,
      passed: 0,
      failed: 1,
      skipped: 0,
      details: [`FAIL vitest run`, out.slice(-800)],
    };
  }
}

async function runE2e(): Promise<SuiteResult> {
  const start = Date.now();
  try {
    execSync("npx playwright test", {
      stdio: "inherit",
      cwd: process.cwd(),
      env: { ...process.env, MATCHPOINT_E2E_REUSE_SERVER: "1" },
    });
    return {
      suite: "playwright-e2e",
      category: "E2E",
      ok: true,
      durationMs: Date.now() - start,
      passed: 1,
      failed: 0,
      skipped: 0,
      details: ["OK playwright test"],
    };
  } catch {
    return {
      suite: "playwright-e2e",
      category: "E2E",
      ok: false,
      durationMs: Date.now() - start,
      passed: 0,
      failed: 1,
      skipped: 0,
      details: ["FAIL playwright test — ver tests/e2e/.artifacts/html-report"],
    };
  }
}

async function main() {
  console.log("\nMATCHPOINT — Matriz de testing\n");
  const results: SuiteResult[] = [];

  results.push(await runSanityTests());
  results.push(await runUnit());

  if (!quick) {
    results.push(await runDatabaseTests());
    results.push(await runSmokeTests());
    results.push(await runIntegrationTests());
    results.push(await runSecurityTests());
    results.push(await runLoadTests());
  }

  if (withE2e) {
    results.push(await runE2e());
  }

  for (const r of results) printSuite(r);
  printSummary(results);

  const ok = results.every((r) => r.ok);
  if (!withE2e && !quick) {
    console.log("Tip: agrega --e2e con dev server corriendo para Playwright completo.\n");
  }
  process.exit(ok ? 0 : 1);
}

main();
