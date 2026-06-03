import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";

const CHAT_STATUSES = new Set(["registration_closed", "live", "finished"]);

export function quedadaChatEligible(status: string, isMember: boolean): boolean {
  return isMember && CHAT_STATUSES.has(status);
}

export function quedadaChatReadOnly(status: string): boolean {
  return status === "finished";
}

/** Crea/sincroniza el canal grupal y devuelve su id (null si no aplica). */
export async function ensureQuedadaConversationId(
  quedadaId: string,
  status: string,
  isMember: boolean,
): Promise<string | null> {
  if (!quedadaChatEligible(status, isMember)) return null;

  const admin = getAdminClient();
  const { data, error } = await (admin as any).rpc("fn_ensure_quedada_channel", {
    p_quedada_id: quedadaId,
  });
  if (error) {
    console.error("[ensureQuedadaConversationId]", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}
