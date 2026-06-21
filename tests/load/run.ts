/**
 * Load / stress / spike / soak — pruebas ligeras contra rutas públicas.
 * No sustituye k6/Artillery en producción; sirve como smoke de capacidad local.
 */
import { getBaseUrlOnly } from "../_shared/env";
import { printSuite, type SuiteResult } from "../_shared/report";

async function hammer(
  path: string,
  concurrency: number,
  iterations: number,
): Promise<{ ok: number; fail: number; latencies: number[] }> {
  const base = getBaseUrlOnly();
  let ok = 0;
  let fail = 0;
  const latencies: number[] = [];

  async function one() {
    const t0 = performance.now();
    try {
      const res = await fetch(`${base}${path}`, { redirect: "follow" });
      latencies.push(performance.now() - t0);
      if (res.status < 500) ok++;
      else fail++;
    } catch {
      latencies.push(performance.now() - t0);
      fail++;
    }
  }

  const workers = Array.from({ length: concurrency }, async () => {
    for (let i = 0; i < iterations; i++) await one();
  });
  await Promise.all(workers);
  return { ok, fail, latencies };
}

function percentile95(latencies: number[]): number {
  if (!latencies.length) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
}

export async function runLoadTests(): Promise<SuiteResult> {
  const start = Date.now();
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  const phases: Array<{
    name: string;
    category: string;
    path: string;
    concurrency: number;
    iterations: number;
    maxFailPct: number;
    maxP95Ms: number;
  }> = [
    {
      name: "load-smoke",
      category: "Load",
      path: "/",
      concurrency: 5,
      iterations: 4,
      maxFailPct: 0,
      maxP95Ms: 8000,
    },
    {
      name: "stress-concurrent",
      category: "Stress",
      path: "/clubes",
      concurrency: 25,
      iterations: 2,
      maxFailPct: 5,
      maxP95Ms: 15000,
    },
    {
      name: "spike-burst",
      category: "Spike",
      path: "/eventos",
      concurrency: 40,
      iterations: 1,
      maxFailPct: 10,
      maxP95Ms: 20000,
    },
    {
      name: "soak-light",
      category: "Endurance",
      path: "/ranking",
      concurrency: 3,
      iterations: 10,
      maxFailPct: 0,
      maxP95Ms: 8000,
    },
  ];

  for (const phase of phases) {
    const { ok, fail, latencies } = await hammer(phase.path, phase.concurrency, phase.iterations);
    const total = ok + fail;
    const failPct = total ? (fail / total) * 100 : 100;
    const p95Ms = percentile95(latencies);
    const phaseOk = failPct <= phase.maxFailPct && p95Ms <= phase.maxP95Ms;
    if (phaseOk) {
      passed++;
      details.push(
        `OK [${phase.category}] ${phase.name}: ${ok}/${total} ok, p95=${Math.round(p95Ms)}ms`,
      );
    } else {
      failed++;
      details.push(
        `FAIL [${phase.category}] ${phase.name}: fail=${failPct.toFixed(1)}% p95=${Math.round(p95Ms)}ms`,
      );
    }
  }

  return {
    suite: "public-load-phases",
    category: "Load / Stress",
    ok: failed === 0,
    durationMs: Date.now() - start,
    passed,
    failed,
    skipped: 0,
    details,
  };
}
