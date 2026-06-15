// Rate limit helper. Token bucket maintained in Postgres via the
// SECURITY DEFINER function `fn_rate_limit_consume`.
//
// Usage:
//   await assertRateLimit({ key: `auth:signup:${ip}`, capacity: 5, refillPerSecond: 5/60 });
//
// Tunables:
//   - capacity            = max tokens (burst size)
//   - refillPerSecond     = refill rate; capacity / refillPerSecond ≈ window in seconds
//
// Throws `MpError('RATE_LIMIT.EXCEEDED', ..., 429)` when out of tokens.
// The proxy can short-circuit too, but this works inside any Server Action
// and includes the per-user scope.
import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { MpError } from "./errors";

export type RateLimitOpts = {
  key: string;
  capacity: number;
  refillPerSecond: number;
  cost?: number;
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
} as const;

export async function assertRateLimit(opts: RateLimitOpts): Promise<void> {
  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("fn_rate_limit_consume", {
    p_key: opts.key,
    p_capacity: opts.capacity,
    p_refill_per_second: opts.refillPerSecond,
    p_cost: opts.cost ?? 1,
  });

  if (error) {
    // Fail open on infra errors — never block a user because the rate-limit
    // DB call hiccupped. We log so we notice.
     
    console.warn("[rate-limit] backend unreachable:", error.message);
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
