import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { executeAccountDeletion } from "@/server/account/execute-account-deletion";

/** Ejecuta borrados definitivos de cuentas con scheduled_deletion_at vencido.
 *  No expuesto como server action — solo invocable desde la API route de cron. */
export async function processScheduledAccountDeletions(limit = 20): Promise<{
  processed: number;
  deleted: string[];
  errors: { userId: string; message: string }[];
}> {
  const admin = getAdminClient();
  const now = new Date().toISOString();

  const { data: candidates, error } = await admin
    .from("profiles")
    .select("*")
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  type DeletionRow = { id: string; scheduled_deletion_at?: string | null };
  const due = ((candidates ?? []) as unknown as DeletionRow[])
    .filter((r) => r.scheduled_deletion_at && r.scheduled_deletion_at <= now)
    .slice(0, limit);

  const deleted: string[] = [];
  const errors: { userId: string; message: string }[] = [];

  for (const row of due ?? []) {
    try {
      await executeAccountDeletion(row.id, row.id);
      deleted.push(row.id);
    } catch (err) {
      errors.push({
        userId: row.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { processed: due.length, deleted, errors };
}
