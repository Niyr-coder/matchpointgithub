// Optimistic locking helper. Use when updating a row that other actors might
// touch concurrently (clubs, applications, reservations).
//
//   await runOptimisticUpdate({
//     table: "club_applications",
//     id,
//     expectedVersion,
//     update: { status: "rejected", rejected_at: new Date().toISOString() },
//   });
//
// Throws CONCURRENT_UPDATE (409) when the version on disk no longer matches.
// Caller should re-read the row, surface the conflict to the user, or retry
// the merge — depending on the operation's nature.
import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { MpError } from "./errors";

export type OptimisticUpdateOpts<T extends Record<string, unknown>> = {
  table: "club_applications" | "reservations" | "clubs";
  id: string;
  /** Si se omite, actualiza sin chequeo de versión (el trigger sigue bump-eando). */
  expectedVersion?: number;
  update: T;
};

export async function runOptimisticUpdate<T extends Record<string, unknown>>(
  opts: OptimisticUpdateOpts<T>,
): Promise<Record<string, unknown>> {
  const supabase = await getServerClient();

  const payload: Record<string, unknown> = { ...opts.update };
  if (opts.expectedVersion !== undefined) {
    payload.version = opts.expectedVersion + 1;
  }

  let query = supabase
    .from(opts.table)
    .update(payload as never)
    .eq("id", opts.id);
  if (opts.expectedVersion !== undefined) {
    query = query.eq("version", opts.expectedVersion);
  }

  const { data, error } = await query.select().maybeSingle();

  if (error) throw new MpError(`${opts.table.toUpperCase()}.UPDATE_FAILED`, error.message, 500);

  if (!data) {
    // Either the row vanished or someone else bumped the version.
    throw new MpError(
      "CONCURRENT_UPDATE",
      "Resource was modified by another request. Reload and retry.",
      409,
    );
  }

  return data as Record<string, unknown>;
}
