// Browser fetch helper. Returns the same { ok, data, error } envelope our
// Route Handlers produce, so call sites don't have to think about response.json().
//
//   const r = await apiGet<Club[]>("/api/v1/clubs", { sport: "padel" });
//   if (!r.ok) showError(r.error.message);
//   else setClubs(r.data);
//
// All four verbs share the same return shape. POST/PATCH/DELETE serialize the
// body to JSON automatically and set Content-Type.

import type { ApiErr, ApiOk } from "./response";

export type ApiResult<T> = ApiOk<T> | ApiErr;

type Query = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function call<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
  path: string,
  opts: { query?: Query; body?: unknown; idempotencyKey?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "NETWORK.UNREACHABLE",
        message: (e as Error).message,
        requestId: crypto.randomUUID(),
      },
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "NETWORK.BAD_RESPONSE",
        message: `Non-JSON response (HTTP ${res.status})`,
        requestId: crypto.randomUUID(),
      },
    };
  }
  return payload as ApiResult<T>;
}

export const apiGet = <T>(path: string, query?: Query) => call<T>("GET", path, { query });
export const apiPost = <T>(path: string, body?: unknown, idempotencyKey?: string) =>
  call<T>("POST", path, { body, idempotencyKey });
export const apiPatch = <T>(path: string, body?: unknown) => call<T>("PATCH", path, { body });
export const apiPut = <T>(path: string, body?: unknown) => call<T>("PUT", path, { body });
export const apiDelete = <T>(path: string, body?: unknown) => call<T>("DELETE", path, { body });
