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
  expectedVersion: number;
  update: T;
};

export async function runOptimisticUpdate<T extends Record<string, unknown>>(
  opts: OptimisticUpdateOpts<T>,
): Promise<Record<string, unknown>> {
  const supabase = await getServerClient();

  const payload = {
    ...opts.update,
    version: opts.expectedVersion + 1,
  } as never;

  const { data, error } = await supabase
    .from(opts.table)
    .update(payload)
    .eq("id", opts.id)
    .eq("version", opts.expectedVersion)
    .select()
    .maybeSingle();

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
