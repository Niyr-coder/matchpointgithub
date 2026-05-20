"use server";

// Acciones admin sobre platform_config. Por ahora solo el switch multideporte.
// Ver docs/product/05-multisport.md.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";

async function requireAdminUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere rol admin");
  return user.id;
}

export async function setMultisportEnabled(input: unknown): Promise<ActionResult<{ enabled: boolean }>> {
  return runAction(z.object({ enabled: z.boolean() }), input, async ({ enabled }) => {
    const adminId = await requireAdminUserId();
    // platform_config es admin-RLS; mutamos con service role tras validar rol.
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    const { error } = await admin
      .from("platform_config")
      .update({ value: enabled } as never) // jsonb acepta el boolean directo
      .eq("key", "multisport_enabled");
    if (error) throw new MpError("CONFIG.UPDATE_FAILED", error.message, 500);
    return { enabled };
  });
}
