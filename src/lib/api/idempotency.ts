// Idempotency helper for Server Actions. Wrap a mutation with
// `withIdempotency({ key, scope, userId, input }, async () => ... )` and
// retries with the same key get the cached response back instead of
// re-executing the side effect.
//
// Storage backs onto `idempotency_keys` (24h TTL). The `request_hash`
// guards against "same key, different body" attacks: a key reuse with a
// mismatched payload is rejected with IDEMPOTENCY.MISMATCH.
import "server-only";

import { createHash } from "node:crypto";
import { getServerClient } from "@/lib/db/client.server";
import { MpError } from "./errors";
import type { ApiOk } from "./response";

export type IdempotencyContext = {
  key: string | null | undefined;
  scope: string;
  userId: string;
  input: unknown;
};

function hashInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input ?? null)).digest("hex");
}

export async function withIdempotency<T>(
  ctx: IdempotencyContext,
  exec: () => Promise<T>,
): Promise<T> {
  if (!ctx.key) return exec();

  const supabase = await getServerClient();
  const hash = hashInput(ctx.input);

  // Try to read a cached response first.
  const { data: cached } = await supabase
    .from("idempotency_keys")
    .select("status_code,response,request_hash")
    .eq("user_id", ctx.userId)
    .eq("scope", ctx.scope)
    .eq("key", ctx.key)
    .maybeSingle();

  if (cached) {
    if (cached.request_hash && cached.request_hash !== hash) {
      throw new MpError(
        "IDEMPOTENCY.MISMATCH",
        "Idempotency-Key reused with a different request body",
        409,
      );
    }
    return (cached.response as ApiOk<T>).data;
  }

  const result = await exec();

  // Best-effort cache write. If the unique constraint races, we silently
  // proceed — the next caller will see the cached response on retry.
  await supabase
    .from("idempotency_keys")
    .insert({
      user_id: ctx.userId,
      scope: ctx.scope,
      key: ctx.key,
      request_hash: hash,
      status_code: 200,
      response: { ok: true, data: result } satisfies ApiOk<T>,
    } as never);

  return result;
}
