/**
 * Contract testing — OpenAPI como contrato vivo vs rutas registradas.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { isDirectRun } from "../_shared/cli";
import { printSuite, type SuiteResult } from "../_shared/report";

const REQUIRED_PATHS = [
  "/api/v1/auth/sign-in",
  "/api/v1/auth/sign-up",
  "/api/v1/me",
  "/api/v1/clubs",
  "/api/v1/tournaments",
  "/api/v1/partners/{id}/club-links",
  "/api/v1/tournaments/{idOrSlug}/register",
];

const REQUIRED_SCHEMAS = ["ApiError", "SignIn", "Tournament"];

export async function runContractTests(): Promise<SuiteResult> {
  const start = Date.now();
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  const specPath = resolve(process.cwd(), "public/openapi.json");
  if (!existsSync(specPath)) {
    return {
      suite: "openapi-contract",
      category: "Contract",
      ok: false,
      durationMs: Date.now() - start,
      passed: 0,
      failed: 1,
      skipped: 0,
      details: ["FAIL public/openapi.json no existe — corre npm run openapi:build"],
    };
  }

  const spec = JSON.parse(readFileSync(specPath, "utf8")) as {
    openapi?: string;
    paths?: Record<string, unknown>;
    components?: { schemas?: Record<string, unknown> };
  };

  if (spec.openapi?.startsWith("3.")) {
    passed++;
    details.push(`OK openapi version ${spec.openapi}`);
  } else {
    failed++;
    details.push("FAIL openapi version missing or invalid");
  }

  for (const p of REQUIRED_PATHS) {
    if (spec.paths?.[p]) {
      passed++;
      details.push(`OK path ${p}`);
    } else {
      failed++;
      details.push(`FAIL path missing ${p}`);
    }
  }

  for (const s of REQUIRED_SCHEMAS) {
    if (spec.components?.schemas?.[s]) {
      passed++;
      details.push(`OK schema ${s}`);
    } else {
      failed++;
      details.push(`FAIL schema missing ${s}`);
    }
  }

  const pathCount = Object.keys(spec.paths ?? {}).length;
  if (pathCount >= 50) {
    passed++;
    details.push(`OK ${pathCount} paths documentados`);
  } else {
    failed++;
    details.push(`FAIL solo ${pathCount} paths (esperado >= 50)`);
  }

  return {
    suite: "openapi-contract",
    category: "Contract",
    ok: failed === 0,
    durationMs: Date.now() - start,
    passed,
    failed,
    skipped: 0,
    details,
  };
}

if (isDirectRun("contract/openapi")) {
  runContractTests().then((r) => {
    printSuite(r);
    process.exit(r.ok ? 0 : 1);
  });
}
