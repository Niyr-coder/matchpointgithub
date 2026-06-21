/**
 * Integration + API endpoint tests contra el dev server.
 */
import { getBaseUrlOnly, getTestEnv } from "../_shared/env";
import { printSuite, type SuiteResult } from "../_shared/report";

type Case = { name: string; run: () => Promise<boolean> };

type ApiBody = { ok?: boolean; data?: unknown; error?: unknown };

async function jsonFetch(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: ApiBody | null }> {
  const res = await fetch(`${getBaseUrlOnly()}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  let body: ApiBody | null = null;
  try {
    body = (await res.json()) as ApiBody;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function isOkDataArray(body: ApiBody | null): boolean {
  return body?.ok === true && Array.isArray(body.data);
}

function isOkEnvelope(body: ApiBody | null): boolean {
  return body?.ok === true && body.data !== undefined;
}

export async function runIntegrationTests(): Promise<SuiteResult> {
  getTestEnv(); // fail-fast env
  const start = Date.now();
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  const cases: Case[] = [
    {
      name: "GET /api/v1/clubs?page=1 → 200 + envelope",
      run: async () => {
        const { status, body } = await jsonFetch("/api/v1/clubs?page=1&pageSize=10");
        return status === 200 && isOkDataArray(body);
      },
    },
    {
      name: "GET /api/v1/clubs/{slug} → 200 + envelope",
      run: async () => {
        const { status, body } = await jsonFetch("/api/v1/clubs/qa-club-prueba");
        return status === 200 && isOkEnvelope(body);
      },
    },
    {
      name: "GET /api/v1/ranking?sport=pickleball → 200 + envelope",
      run: async () => {
        const { status, body } = await jsonFetch(
          "/api/v1/ranking?sport=pickleball&page=1&pageSize=10",
        );
        return status === 200 && isOkEnvelope(body);
      },
    },
    {
      name: "GET /api/v1/tournaments?page=1 → 200 + envelope",
      run: async () => {
        const { status, body } = await jsonFetch("/api/v1/tournaments?page=1&pageSize=10");
        return status === 200 && isOkDataArray(body);
      },
    },
    {
      name: "GET /api/v1/me sin sesión → 401",
      run: async () => {
        const { status } = await jsonFetch("/api/v1/me");
        return status === 401;
      },
    },
    {
      name: "POST /api/v1/auth/sign-in credenciales inválidas → 4xx",
      run: async () => {
        const { status } = await jsonFetch("/api/v1/auth/sign-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "no-existe@test.invalid", password: "wrong" }),
        });
        return status >= 400 && status < 500;
      },
    },
    {
      name: "GET ranking con input malicioso → no 500",
      run: async () => {
        const { status } = await jsonFetch(
          "/api/v1/ranking?sport=pickleball&city=" + encodeURIComponent("' OR 1=1 --"),
        );
        return status < 500;
      },
    },
    {
      name: "GET public/openapi.json → 200",
      run: async () => {
        const res = await fetch(`${getBaseUrlOnly()}/openapi.json`);
        return res.status === 200;
      },
    },
  ];

  for (const c of cases) {
    try {
      const ok = await c.run();
      if (ok) {
        passed++;
        details.push(`OK ${c.name}`);
      } else {
        failed++;
        details.push(`FAIL ${c.name}`);
      }
    } catch (e) {
      failed++;
      details.push(`FAIL ${c.name} → ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    suite: "api-integration",
    category: "Integration / API",
    ok: failed === 0,
    durationMs: Date.now() - start,
    passed,
    failed,
    skipped: 0,
    details,
  };
}
