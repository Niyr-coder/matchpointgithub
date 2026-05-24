"use server";

// Club Config · Reglas. CRUD sobre club_rules para owner/manager del club.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClubRule, ReglasData } from "@/components/dashboard/owner/config-sections/ReglasSection";

const MAX_RULES = 12;
const LABEL_MAX = 80;
const DESCRIPTION_MAX = 240;
const ICON_MAX = 40;

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

async function requireClubManagerUserId(clubId: string): Promise<string> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", userId)
    .is("revoked_at", null);
  const ok = (roles ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId && (r.role === "owner" || r.role === "manager")),
  );
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Club owner/manager required");
  return userId;
}

function mapRule(row: Record<string, unknown>): ClubRule {
  return {
    id: row.id as string,
    label: row.label as string,
    description: (row.description as string | null) ?? null,
    icon: (row.icon as string | null) ?? "check",
    enabled: Boolean(row.enabled),
    ordinal: (row.ordinal as number | null) ?? 0,
  };
}

// loadReglasData — sin auth interna (el Screen ya validó). Lista las reglas
// del club ordenadas por ordinal/created_at.
export async function loadReglasData(
  supabase: SupabaseClient,
  clubId: string,
): Promise<ReglasData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("club_rules")
    .select("*")
    .eq("club_id", clubId)
    .order("ordinal", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[loadReglasData] db error", error);
    return { rules: [] };
  }
  return {
    rules: ((data ?? []) as Record<string, unknown>[]).map((r) => mapRule(r)),
  };
}

// ── createClubRule ──────────────────────────────────────────────────────
const CreateSchema = z.object({
  clubId: UuidSchema,
  label: z.string().trim().min(1, "El título es obligatorio").max(LABEL_MAX),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  icon: z.string().trim().max(ICON_MAX).optional().default("check"),
});

export async function createClubRule(
  input: unknown,
): Promise<ActionResult<ClubRule>> {
  return runAction(CreateSchema, input, async ({ clubId, label, description, icon }) => {
    const userId = await requireClubManagerUserId(clubId);
    const adminClient = getAdminClient();
    await setAuditActor(adminClient, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = adminClient as any;

    const { count, error: countErr } = await admin
      .from("club_rules")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("id", { count: "exact", head: true } as any)
      .eq("club_id", clubId);
    if (countErr) throw new MpError("CLUB_RULES.DB_ERROR", countErr.message, 500);
    if ((count ?? 0) >= MAX_RULES) {
      throw new MpError(
        "CLUB_RULES.CAP_REACHED",
        `Máximo ${MAX_RULES} reglas por club`,
        409,
      );
    }

    const { data: last } = await admin
      .from("club_rules")
      .select("ordinal")
      .eq("club_id", clubId)
      .order("ordinal", { ascending: false })
      .limit(1);
    const nextOrdinal =
      last && last[0] ? ((last[0].ordinal as number | null) ?? 0) + 1 : 1;

    const { data, error } = await admin
      .from("club_rules")
      .insert({
        club_id: clubId,
        label,
        description,
        icon: icon ?? "check",
        enabled: true,
        ordinal: nextOrdinal,
      } as never)
      .select()
      .single();
    if (error) throw new MpError("CLUB_RULES.CREATE_FAILED", error.message, 500);
    return mapRule(data as Record<string, unknown>);
  });
}

// ── updateClubRule ──────────────────────────────────────────────────────
const UpdateSchema = z.object({
  id: UuidSchema,
  label: z.string().trim().min(1).max(LABEL_MAX).optional(),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX)
    .nullable()
    .optional(),
  icon: z.string().trim().max(ICON_MAX).optional(),
  ordinal: z.number().int().min(0).optional(),
});

export async function updateClubRule(
  input: unknown,
): Promise<ActionResult<ClubRule>> {
  return runAction(UpdateSchema, input, async ({ id, label, description, icon, ordinal }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin0 = getAdminClient() as any;
    const { data: existing } = await admin0
      .from("club_rules")
      .select("club_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) throw new MpError("CLUB_RULES.NOT_FOUND", "Regla no encontrada", 404);

    const userId = await requireClubManagerUserId(existing.club_id as string);
    const adminClient = getAdminClient();
    await setAuditActor(adminClient, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = adminClient as any;

    const payload: Record<string, unknown> = {};
    if (label !== undefined) payload.label = label;
    if (description !== undefined) {
      payload.description = description && description.length > 0 ? description : null;
    }
    if (icon !== undefined) payload.icon = icon;
    if (ordinal !== undefined) payload.ordinal = ordinal;

    const { data, error } = await admin
      .from("club_rules")
      .update(payload as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new MpError("CLUB_RULES.UPDATE_FAILED", error.message, 500);
    return mapRule(data as Record<string, unknown>);
  });
}

// ── toggleClubRule ──────────────────────────────────────────────────────
const ToggleSchema = z.object({
  id: UuidSchema,
  enabled: z.boolean(),
});

export async function toggleClubRule(
  input: unknown,
): Promise<ActionResult<ClubRule>> {
  return runAction(ToggleSchema, input, async ({ id, enabled }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin0 = getAdminClient() as any;
    const { data: existing } = await admin0
      .from("club_rules")
      .select("club_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) throw new MpError("CLUB_RULES.NOT_FOUND", "Regla no encontrada", 404);

    const userId = await requireClubManagerUserId(existing.club_id as string);
    const adminClient = getAdminClient();
    await setAuditActor(adminClient, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = adminClient as any;

    const { data, error } = await admin
      .from("club_rules")
      .update({ enabled } as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new MpError("CLUB_RULES.UPDATE_FAILED", error.message, 500);
    return mapRule(data as Record<string, unknown>);
  });
}

// ── deleteClubRule ──────────────────────────────────────────────────────
export async function deleteClubRule(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin0 = getAdminClient() as any;
    const { data: existing } = await admin0
      .from("club_rules")
      .select("club_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) throw new MpError("CLUB_RULES.NOT_FOUND", "Regla no encontrada", 404);

    const userId = await requireClubManagerUserId(existing.club_id as string);
    const adminClient = getAdminClient();
    await setAuditActor(adminClient, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = adminClient as any;

    const { error } = await admin.from("club_rules").delete().eq("id", id);
    if (error) throw new MpError("CLUB_RULES.DELETE_FAILED", error.message, 500);
    return { id };
  });
}
