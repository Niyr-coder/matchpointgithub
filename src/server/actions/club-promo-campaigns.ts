"use server";

// Creación de campañas promocionales de club desde plantillas predefinidas.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import {
  fmtPromoEndDate,
  getClubPromoTemplate,
  type ClubPromoTemplateKey,
} from "@/lib/marketing/club-promo-templates";

async function requireClubStaffForPromo(clubId: string): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  const ok = (roles ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId && (r.role === "owner" || r.role === "manager")),
  );
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el staff del club puede crear campañas");
  return user.id;
}

const CreateFromTemplateSchema = z.object({
  clubId: UuidSchema,
  templateKey: z.enum(["welcome15", "bring1", "combo20"]),
  maxUses: z.number().int().min(1).max(10_000).optional(),
});

export async function createClubPromoFromTemplate(
  input: unknown,
): Promise<ActionResult<{ id: string; code: string }>> {
  return runAction(CreateFromTemplateSchema, input, async (data) => {
    const tpl = getClubPromoTemplate(data.templateKey);
    if (!tpl) throw new MpError("PROMO.TEMPLATE_NOT_FOUND", "Plantilla no encontrada", 404);

    const userId = await requireClubStaffForPromo(data.clubId);
    const supabase = await getServerClient();

    const { data: existing } = await supabase
      .from("broadcasts")
      .select("id,status,payload")
      .eq("scope", "club")
      .eq("club_id", data.clubId);

    const duplicate = (existing ?? []).some((row) => {
      const payload = (row.payload as Record<string, unknown> | null) ?? {};
      const key = (payload.template_key ?? payload.default_key) as string | undefined;
      if (key !== data.templateKey) return false;
      return row.status !== "cancelled";
    });
    if (duplicate) {
      throw new MpError(
        "PROMO.DUPLICATE",
        "Ya tienes una campaña activa de este tipo. Pausa la anterior o elige otra plantilla.",
        409,
      );
    }

    const maxUses = data.maxUses ?? tpl.defaultMax;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + tpl.defaultDays);

    const payload = {
      template_key: data.templateKey,
      kind: tpl.kind,
      code: tpl.code,
      max: maxUses,
      tag: "BORRADOR",
      bg: tpl.bg,
      accent: tpl.accent,
      end: fmtPromoEndDate(tpl.defaultDays),
      expires_at: expiresAt.toISOString(),
    };

    const { data: row, error } = await supabase
      .from("broadcasts")
      .insert({
        scope: "club",
        club_id: data.clubId,
        title: tpl.title,
        body: tpl.body,
        channels: ["inapp"],
        target_filter: {},
        status: "draft",
        payload,
        created_by: userId,
      } as never)
      .select()
      .single();

    if (error) throw new MpError("PROMO.CREATE_FAILED", error.message, 500);
    return { id: row.id as string, code: tpl.code };
  });
}

export async function listClubPromoTemplateKeys(): Promise<ClubPromoTemplateKey[]> {
  return ["welcome15", "bring1", "combo20"];
}
