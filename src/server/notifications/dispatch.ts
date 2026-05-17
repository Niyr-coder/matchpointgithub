// Server-side notification dispatcher.
//
// Llama a `fn_enqueue_notification` (SECURITY DEFINER) usando el admin client
// para garantizar que el INSERT en `notifications` ocurra aun cuando el
// usuario actor no tenga permiso de escribir en la tabla destino.
//
// Diseño:
//   - Importar desde server actions: `import { notify, notifyAdmins } from "@/server/notifications/dispatch";`
//   - Nunca lanza: los fallos se loguean pero no rompen la action principal.
//   - Cualquier `kind` debe existir previamente en `notification_kinds`
//     (ver supabase/migrations/032_seed_notification_kinds.sql).
import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { captureError } from "@/lib/observability/sentry";

type MpRole = "admin" | "partner" | "user" | "owner" | "manager" | "coach" | "employee";

export type NotifyInput = {
  userId: string;
  role: MpRole;
  kind: string;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown>;
};

/** Enqueue una notificación a un único usuario+rol. No lanza. */
export async function notify(input: NotifyInput): Promise<string | null> {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.rpc("fn_enqueue_notification", {
      p_user_id: input.userId,
      p_role: input.role,
      p_kind: input.kind,
      p_title: input.title,
      p_body: input.body ?? undefined,
      p_payload: (input.payload ?? {}) as never,
    });
    if (error) {
      captureError(error, { tag: "notify", kind: input.kind, role: input.role });
      return null;
    }
    return (data as string) ?? null;
  } catch (err) {
    captureError(err, { tag: "notify", kind: input.kind });
    return null;
  }
}

/**
 * Enqueue la misma notificación a todos los admins activos (rol=admin).
 * Se ejecuta en paralelo y descarta errores individuales.
 */
export async function notifyAdmins(
  args: Omit<NotifyInput, "userId" | "role">,
): Promise<number> {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("role_assignments")
      .select("user_id")
      .eq("role", "admin")
      .is("revoked_at", null);
    if (error) {
      captureError(error, { tag: "notifyAdmins", kind: args.kind });
      return 0;
    }
    const ids = Array.from(new Set((data ?? []).map((r) => r.user_id as string)));
    if (ids.length === 0) return 0;
    const results = await Promise.all(
      ids.map((userId) => notify({ ...args, userId, role: "admin" })),
    );
    return results.filter(Boolean).length;
  } catch (err) {
    captureError(err, { tag: "notifyAdmins", kind: args.kind });
    return 0;
  }
}
