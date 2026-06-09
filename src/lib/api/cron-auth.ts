import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Autoriza invocaciones de cron (Vercel Bearer o ?token=). */
export function authorizeCron(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length);
    if (safeEqual(token, expected)) return true;
  }

  const queryToken = req.nextUrl.searchParams.get("token");
  if (queryToken && safeEqual(queryToken, expected)) return true;

  return false;
}
