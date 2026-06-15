// Rate limit helper. Token bucket maintained in Postgres via the
// SECURITY DEFINER function `fn_rate_limit_consume` (solo service_role).
//
// Usage:
//   await assertRateLimit({ key: `auth:signup:${ip}`, ...RATE_LIMITS.authSensitive, failClosed: true });
//
// Throws `MpError('RATE_LIMIT.EXCEEDED', ..., 429)` when out of tokens.
import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { MpError } from "./errors";

export type RateLimitOpts = {
  key: string;
  capacity: number;
  refillPerSecond: number;
  cost?: number;
  /** Si true, un fallo del backend bloquea la request (auth, sales, proofs). */
  failClosed?: boolean;
};

export const RATE_LIMITS = {
  authSensitive: { capacity: 5, refillPerSecond: 5 / 60 },    // 5/minute
  authNormal: { capacity: 30, refillPerSecond: 30 / 60 },     // 30/minute
  mutationsAuthn: { capacity: 60, refillPerSecond: 60 / 60 }, // 60/minute
  reads: { capacity: 600, refillPerSecond: 600 / 60 },        // 600/minute
  paymentProof: { capacity: 10, refillPerSecond: 10 / 3600 }, // 10/hour
  tournamentRegister: { capacity: 20, refillPerSecond: 20 / 3600 }, // 20/hour
  tournamentCreate: { capacity: 10, refillPerSecond: 10 / 3600 }, // 10/hour
  giveawayEnter: { capacity: 30, refillPerSecond: 30 / 3600 }, // 30/hour
  salesLead: { capacity: 5, refillPerSecond: 5 / 3600 }, // 5/hour por IP
} as const;

export async function assertRateLimit(opts: RateLimitOpts): Promise<void> {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("fn_rate_limit_consume", {
    p_key: opts.key,
    p_capacity: opts.capacity,
    p_refill_per_second: opts.refillPerSecond,
    p_cost: opts.cost ?? 1,
  });

  if (error) {
    console.warn("[rate-limit] backend unreachable:", error.message);
    if (opts.failClosed) {
      throw new MpError(
        "RATE_LIMIT.UNAVAILABLE",
        "No pudimos verificar el límite de solicitudes. Intenta de nuevo en un momento.",
        503,
      );
    }
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row && row.allowed === false) {
    const retrySec = Math.ceil(Number(row.retry_after_seconds ?? 1));
    throw new MpError(
      "RATE_LIMIT.EXCEEDED",
      `Demasiadas solicitudes. Intenta de nuevo en ${retrySec}s`,
      429,
    );
  }
}
