// Discriminated-union response shape used by Route Handlers and Server Actions.
// See docs/architecture/00-overview.md §8 and 40-api.md.

import { NextResponse } from "next/server";

export type PageMeta = { page: number; pageSize: number; total: number };

export type ApiOk<T> = { ok: true; data: T; meta?: PageMeta };
export type ApiErr = {
  ok: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    requestId: string;
  };
};

export type ApiResult<T> = ApiOk<T> | ApiErr;

export const ok = <T>(data: T, meta?: PageMeta): ApiOk<T> => ({ ok: true, data, ...(meta ? { meta } : {}) });

export const fail = (
  code: string,
  message: string,
  opts?: { fields?: Record<string, string[]>; requestId?: string },
): ApiErr => ({
  ok: false,
  error: {
    code,
    message,
    ...(opts?.fields ? { fields: opts.fields } : {}),
    requestId: opts?.requestId ?? crypto.randomUUID(),
  },
});

// HTTP helpers
export const httpOk = <T>(data: T, init?: { status?: number; meta?: PageMeta }) =>
  NextResponse.json(ok(data, init?.meta), { status: init?.status ?? 200 });

export const httpFail = (
  status: number,
  code: string,
  message: string,
  opts?: { fields?: Record<string, string[]>; requestId?: string },
) => NextResponse.json(fail(code, message, opts), { status });
