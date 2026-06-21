export type SuiteResult = {
  suite: string;
  category: string;
  ok: boolean;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  details: string[];
};

export function printSuite(result: SuiteResult): void {
  const icon = result.ok ? "✓" : "✗";
  console.log(
    `${icon} [${result.category}] ${result.suite} — ${result.passed} ok, ${result.failed} fail, ${result.skipped} skip (${result.durationMs}ms)`,
  );
  for (const line of result.details) {
    console.log(`    ${line}`);
  }
}

export function printSummary(results: SuiteResult[]): void {
  const failed = results.filter((r) => !r.ok);
  console.log("\n══════════════════════════════════════════");
  console.log(`Suites: ${results.length} | OK: ${results.length - failed.length} | FAIL: ${failed.length}`);
  if (failed.length) {
    console.log("\nFallidas:");
    for (const f of failed) console.log(`  • [${f.category}] ${f.suite}`);
  }
  console.log("══════════════════════════════════════════\n");
}
