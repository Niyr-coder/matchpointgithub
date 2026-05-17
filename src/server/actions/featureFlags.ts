"use server";

// Feature flags: admin manages, everyone can query their effective set.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { FeatureFlagSchema, FeatureFlagUpsertSchema, type FeatureFlag } from "@/lib/schemas/ops";

async function requireAdmin(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Admin required");
  return user.id;
}

function mapFlag(row: Record<string, unknown>): FeatureFlag {
  return FeatureFlagSchema.parse({
    key: row.key,
    description: row.description,
    enabledDefault: row.enabled_default,
    rolloutPct: row.rollout_pct,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listFlags(): Promise<ActionResult<FeatureFlag[]>> {
  return runAction(z.undefined(), undefined, async () => {
    await requireAdmin();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("feature_flags")
      .select("*")
      .order("key");
    if (error) throw new MpError("FLAGS.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapFlag);
  });
}

export async function upsertFlag(input: unknown): Promise<ActionResult<FeatureFlag>> {
  return runAction(FeatureFlagUpsertSchema, input, async (data) => {
    await requireAdmin();
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("feature_flags")
      .upsert(
        {
          key: data.key,
          description: data.description,
          enabled_default: data.enabledDefault,
          rollout_pct: data.rolloutPct,
        } as never,
        { onConflict: "key" },
      )
      .select()
      .single();
    if (error) throw new MpError("FLAGS.UPSERT_FAILED", error.message, 500);
    return mapFlag(row);
  });
}

export async function deleteFlag(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ key: z.string().min(1).max(80) }), input, async ({ key }) => {
    await requireAdmin();
    const supabase = await getServerClient();
    const { error } = await supabase.from("feature_flags").delete().eq("key", key);
    if (error) throw new MpError("FLAGS.DELETE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

const ScopeSchema = z.enum(["user", "club", "role"]);

export async function upsertFlagAssignment(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({
      flagKey: z.string().min(1),
      scope: ScopeSchema,
      scopeId: z.string().min(1),
      enabled: z.boolean(),
      reason: z.string().max(500).optional(),
    }),
    input,
    async ({ flagKey, scope, scopeId, enabled, reason }) => {
      await requireAdmin();
      const supabase = await getServerClient();
      const { error } = await supabase
        .from("feature_flag_assignments")
        .upsert(
          { flag_key: flagKey, scope, scope_id: scopeId, enabled, reason: reason ?? null } as never,
          { onConflict: "flag_key,scope,scope_id" },
        );
      if (error) throw new MpError("FLAGS.ASSIGN_FAILED", error.message, 500);
      return { ok: true as const };
    },
  );
}

export async function deleteFlagAssignment(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({
      flagKey: z.string().min(1),
      scope: ScopeSchema,
      scopeId: z.string().min(1),
    }),
    input,
    async ({ flagKey, scope, scopeId }) => {
      await requireAdmin();
      const supabase = await getServerClient();
      const { error } = await supabase
        .from("feature_flag_assignments")
        .delete()
        .eq("flag_key", flagKey)
        .eq("scope", scope)
        .eq("scope_id", scopeId);
      if (error) throw new MpError("FLAGS.ASSIGN_DELETE_FAILED", error.message, 500);
      return { ok: true as const };
    },
  );
}

export async function listFlagAssignments(input: unknown): Promise<ActionResult<{ flag_key: string; scope: string; scope_id: string; enabled: boolean; reason: string | null }[]>> {
  return runAction(z.object({ flagKey: z.string().min(1) }), input, async ({ flagKey }) => {
    await requireAdmin();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("feature_flag_assignments")
      .select("flag_key,scope,scope_id,enabled,reason")
      .eq("flag_key", flagKey);
    if (error) throw new MpError("FLAGS.ASSIGN_LIST_FAILED", error.message, 500);
    return (data ?? []) as { flag_key: string; scope: string; scope_id: string; enabled: boolean; reason: string | null }[];
  });
}

// ── getMyEffectiveFlags ────────────────────────────────────────────────
export async function getMyEffectiveFlags(): Promise<ActionResult<Record<string, boolean>>> {
  return runAction(z.undefined(), undefined, async () => {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");

    const { data, error } = await supabase.rpc("fn_my_effective_flags");
    if (error) throw new MpError("FLAGS.RPC_FAILED", error.message, 500);
    const map: Record<string, boolean> = {};
    for (const r of (data ?? []) as { key: string; enabled: boolean }[]) {
      map[r.key] = Boolean(r.enabled);
    }
    return map;
  });
}
