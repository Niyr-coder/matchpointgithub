import "server-only";

import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";

/** Borrado definitivo vía Supabase Auth (cascade a profiles y tablas dependientes). */
export async function executeAccountDeletion(userId: string, actorId: string): Promise<void> {
  const admin = getAdminClient();
  await setAuditActor(admin, actorId, actorId === userId ? "user" : "admin");

  // Anonimizar referencias financieras antes de borrar el perfil.
  await admin
    .from("transactions")
    .update({ customer_user_id: null } as never)
    .eq("customer_user_id", userId);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(error.message);
  }
}
