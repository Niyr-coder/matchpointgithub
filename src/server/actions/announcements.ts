"use server";

// Banner de anuncio global (canal "Banner" de Comunicaciones). Admin-only,
// auditado. UNO activo a la vez: publicar desactiva los anteriores. Mig 162.
import "server-only";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { requireAdminUserId } from "@/lib/auth/session";

export async function setAnnouncementBanner(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(
    z.object({
      message: z.string().min(1).max(280),
      level: z.enum(["info", "warn", "critical"]).default("info"),
      ctaLabel: z.string().max(40).optional(),
      ctaHref: z.string().max(300).optional(),
      startsAt: z.string().optional(),
      endsAt: z.string().optional(),
    }),
    input,
    async ({ message, level, ctaLabel, ctaHref, startsAt, endsAt }) => {
      const adminId = await requireAdminUserId();
      const supabase = await getServerClient();
      // Uno a la vez: desactiva los activos antes de publicar el nuevo.
      await supabase.from("announcements").update({ active: false } as never).eq("active", true);
      const { data, error } = await supabase
        .from("announcements")
        .insert({
          message,
          level,
          cta_label: ctaLabel || null,
          cta_href: ctaHref || null,
          starts_at: startsAt || null,
          ends_at: endsAt || null,
          active: true,
          created_by: adminId,
        } as never)
        .select("id")
        .single();
      if (error) throw new MpError("ANNOUNCEMENTS.CREATE_FAILED", error.message, 500);
      revalidatePath("/dashboard", "layout");
      return { id: data.id as string };
    },
  );
}

export async function clearAnnouncementBanner(): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.undefined(), undefined, async () => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const { error } = await supabase.from("announcements").update({ active: false } as never).eq("active", true);
    if (error) throw new MpError("ANNOUNCEMENTS.CLEAR_FAILED", error.message, 500);
    revalidatePath("/dashboard", "layout");
    return { ok: true as const };
  });
}
