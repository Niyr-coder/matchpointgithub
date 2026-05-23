// Admin / service-role Supabase client.
// BYPASSES RLS. Server-only. Use sparingly:
//   - notification dispatcher
//   - pg_cron-equivalent workers
//   - webhook handlers that need cross-tenant writes
//   - migrations / seed scripts
//   - SECURITY DEFINER helpers when called from app code
//
// NEVER import this from any file that may end up in a Client Component bundle.
import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { PUBLIC_SUPABASE_URL, getServiceRoleKey } from "./env";

let cached: ReturnType<typeof createClient<Database>> | null = null;

export function getAdminClient() {
  if (cached) return cached;
  cached = createClient<Database>(PUBLIC_SUPABASE_URL, getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

// Setea actor para que el trigger tg_audit registre actor_id/actor_role
// correcto cuando se usa admin client (donde auth.uid() es null). Llamar
// ANTES de cualquier UPDATE/INSERT/DELETE en una acción admin. Reset
// implícito: el setting es por sesión, así que en pgbouncer
// transaction-mode el siguiente request en la misma conexión arrancaría
// limpio. Best-effort — no es bulletproof, pero supera al estado anterior
// donde actor siempre era null.
//
// Uso típico:
//   const adminId = await requireAdminUserId();
//   const admin = getAdminClient();
//   await setAuditActor(admin, adminId, "admin");
//   await admin.from("profiles").update(...);
export async function setAuditActor(
  client: ReturnType<typeof getAdminClient>,
  userId: string,
  role: "admin" | "system" | "partner" | "owner" | "user" = "admin",
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any).rpc("mp_set_audit_actor", {
    _user_id: userId,
    _role: role,
  });
  if (error) {
    console.error("[setAuditActor] failed", error);
  }
}
