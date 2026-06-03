"use server";

// Verificación de integridad del audit_log (hash chain). Solo admin.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";

export type ChainStatus = { ok: boolean; checked: number; brokenId: number | null };
export type RebackfillResult = { rebuilt: number };

// Recorre la cadena de hashes y confirma que ninguna fila fue alterada/borrada.
export async function verifyAuditChain(input: unknown): Promise<ActionResult<ChainStatus>> {
  return runAction(z.undefined(), input, async () => {
    const supabase = await getServerClient();
    const { data, error } = await supabase.rpc("fn_verify_audit_chain");
    if (error) throw new MpError("AUDIT.VERIFY_FAILED", error.message, 500);
    const row = (data ?? [])[0] as { ok: boolean; checked: number; broken_id: number | null } | undefined;
    return {
      ok: row?.ok ?? true,
      checked: Number(row?.checked ?? 0),
      brokenId: row?.broken_id ?? null,
    };
  });
}

/** Recomputa prev_hash/row_hash en orden de id. Solo admin; usar tras migraciones o gaps por DELETE indebido. */
export async function rebackfillAuditChain(input: unknown): Promise<ActionResult<RebackfillResult>> {
  return runAction(z.undefined(), input, async () => {
    const supabase = await getServerClient();
    const { data, error } = await supabase.rpc("fn_rebackfill_audit_chain");
    if (error) throw new MpError("AUDIT.REBACKFILL_FAILED", error.message, 500);
    const row = (data ?? [])[0] as { rebuilt: number } | undefined;
    return { rebuilt: Number(row?.rebuilt ?? 0) };
  });
}
