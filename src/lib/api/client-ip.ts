import "server-only";

import { headers } from "next/headers";
import type { NextRequest } from "next/server";

/** IP del cliente para rate limits (Server Actions / Route Handlers). */
export async function clientIpFromHeaders(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export function clientIpFromRequest(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? null;
}
