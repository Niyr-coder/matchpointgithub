"use server";

// Editor de la matriz RBAC (role_capabilities). Solo admin (lo enforce la RLS
// rolecap_admin_all + el check explícito). El rol admin es INMUTABLE = todo.
// La edición queda en el audit log (tg_audit_role_capabilities). Mig 158.
import "server-only";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";

const ROLE = z.enum(["admin", "partner", "owner", "manager", "coach", "employee", "user"]);
const LEVEL = z.enum(["all", "limited", "own", "public", "none"]);

export async function updateRoleCapability(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({ role: ROLE, capKey: z.string().min(1).max(64), level: LEVEL }),
    input,
    async ({ role, capKey, level }) => {
      if (role === "admin") {
        throw new MpError("ROLES.ADMIN_IMMUTABLE", "El rol admin tiene acceso total y no se puede editar.", 422);
      }
      const supabase = await getServerClient();
      const { error } = await supabase
        .from("role_capabilities")
        .upsert({ role, cap_key: capKey, level, updated_at: new Date().toISOString() } as never, { onConflict: "role,cap_key" });
      if (error) throw new MpError("ROLES.CAP_UPDATE_FAILED", error.message, 500);
      revalidatePath("/dashboard/admin/admin-roles");
      return { ok: true as const };
    },
  );
}
