"use server";

// Plantillas de campañas (Comunicaciones). Admin guarda/borra/lista plantillas
// del composer. Mig 163. Admin-only (RLS btpl_admin_all + check explícito).
import "server-only";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";

export type BroadcastTemplate = {
  id: string;
  name: string;
  channel: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  targetFilter: Record<string, unknown>;
  uses: number;
};

async function requireAdminId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data } = await supabase.from("role_assignments").select("role").eq("user_id", user.id).eq("role", "admin").is("revoked_at", null).maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Admin required");
  return user.id;
}

export async function saveBroadcastTemplate(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(
    z.object({
      name: z.string().min(1).max(80),
      channel: z.string().max(20).default("inapp"),
      title: z.string().max(200).default(""),
      body: z.string().max(280).default(""),
      ctaLabel: z.string().max(40).optional(),
      targetFilter: z.record(z.string(), z.unknown()).default({}),
    }),
    input,
    async ({ name, channel, title, body, ctaLabel, targetFilter }) => {
      const adminId = await requireAdminId();
      const supabase = await getServerClient();
      const { data, error } = await supabase
        .from("broadcast_templates")
        .insert({ name, channel, title, body, cta_label: ctaLabel || null, target_filter: targetFilter, created_by: adminId } as never)
        .select("id")
        .single();
      if (error) throw new MpError("TEMPLATES.SAVE_FAILED", error.message, 500);
      revalidatePath("/dashboard/admin/admin-broadcast");
      return { id: data.id as string };
    },
  );
}

export async function deleteBroadcastTemplate(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ id: z.string().uuid() }), input, async ({ id }) => {
    await requireAdminId();
    const supabase = await getServerClient();
    const { error } = await supabase.from("broadcast_templates").delete().eq("id", id);
    if (error) throw new MpError("TEMPLATES.DELETE_FAILED", error.message, 500);
    revalidatePath("/dashboard/admin/admin-broadcast");
    return { ok: true as const };
  });
}
