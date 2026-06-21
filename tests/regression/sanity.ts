/**
 * Sanity + regression rápida — gates mínimos pre-deploy.
 */
import { execSync } from "node:child_process";
import { printSuite, type SuiteResult } from "../_shared/report";
import { runContractTests } from "../contract/openapi";

export async function runSanityTests(): Promise<SuiteResult> {
  const start = Date.now();
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  function runCmd(name: string, cmd: string) {
    try {
      execSync(cmd, { stdio: "pipe", cwd: process.cwd() });
      passed++;
      details.push(`OK ${name}`);
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      details.push(`FAIL ${name} → ${msg.split("\n")[0]}`);
    }
  }

  runCmd("Regression: typecheck", "npm run typecheck");
  runCmd("Regression: openapi build", "npm run openapi:build");

  const contract = await runContractTests();
  if (contract.ok) {
    passed++;
    details.push("OK contract sanity");
  } else {
    failed++;
    details.push("FAIL contract sanity");
  }

  return {
    suite: "sanity-regression",
    category: "Sanity / Regression",
    ok: failed === 0,
    durationMs: Date.now() - start,
    passed,
    failed,
    skipped: 0,
    details,
  };
}
