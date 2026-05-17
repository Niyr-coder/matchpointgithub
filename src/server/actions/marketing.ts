"use server";

// Marketing broadcasts. Sending = enqueue + later dispatcher fan-out.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  BroadcastCreateSchema,
  BroadcastListParamsSchema,
  BroadcastSchema,
  type Broadcast,
} from "@/lib/schemas/ops";
import { UuidSchema } from "@/lib/schemas/common";

function mapBroadcast(row: Record<string, unknown>): Broadcast {
  return BroadcastSchema.parse({
    id: row.id,
    scope: row.scope,
    clubId: (row.club_id as string | null) ?? null,
    partnerId: (row.partner_id as string | null) ?? null,
    title: row.title,
    body: row.body,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    channels: row.channels,
    targetFilter: (row.target_filter ?? {}) as Record<string, unknown>,
    scheduledFor: (row.scheduled_for as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  });
}

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

async function assertCanBroadcast(
  scope: "platform" | "club" | "partner",
  clubId?: string | null,
  partnerId?: string | null,
): Promise<string> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  if (scope === "platform") {
    const { data } = await supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .is("revoked_at", null)
      .maybeSingle();
    if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Admin required for platform broadcasts");
  } else if (scope === "club") {
    if (!clubId) throw new MpError("BROADCASTS.SCOPE_INVALID", "club scope requires clubId", 422);
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
    if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff required");
  } else if (scope === "partner") {
    if (!partnerId) throw new MpError("BROADCASTS.SCOPE_INVALID", "partner scope requires partnerId", 422);
    const { data } = await supabase
      .from("partner_members")
      .select("role")
      .eq("partner_id", partnerId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data || !["owner", "admin"].includes(data.role as string)) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Partner-admin required");
    }
  }
  return userId;
}

export async function listBroadcasts(input: unknown): Promise<ActionResult<Broadcast[]>> {
  return runAction(BroadcastListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    let q = supabase
      .from("broadcasts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(params.limit);
    if (params.scope) q = q.eq("scope", params.scope);
    if (params.clubId) q = q.eq("club_id", params.clubId);
    if (params.status) q = q.eq("status", params.status);
    const { data, error } = await q;
    if (error) throw new MpError("BROADCASTS.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapBroadcast);
  });
}

export async function createBroadcast(input: unknown): Promise<ActionResult<Broadcast>> {
  return runAction(BroadcastCreateSchema, input, async (data) => {
    const userId = await assertCanBroadcast(data.scope, data.clubId, data.partnerId);
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("broadcasts")
      .insert({
        scope: data.scope,
        club_id: data.clubId ?? null,
        partner_id: data.partnerId ?? null,
        title: data.title,
        body: data.body,
        channels: data.channels,
        target_filter: data.targetFilter,
        scheduled_for: data.scheduledFor ?? null,
        status: data.scheduledFor ? "scheduled" : "draft",
        created_by: userId,
      } as never)
      .select()
      .single();
    if (error) throw new MpError("BROADCASTS.CREATE_FAILED", error.message, 500);
    return mapBroadcast(row);
  });
}

export async function cancelBroadcast(input: unknown): Promise<ActionResult<Broadcast>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const { data: current } = await supabase
      .from("broadcasts")
      .select("scope,club_id,partner_id,status")
      .eq("id", id)
      .single();
    if (!current) throw new MpError("BROADCASTS.NOT_FOUND", "Broadcast not found", 404);
    await assertCanBroadcast(
      current.scope as "platform" | "club" | "partner",
      current.club_id as string | null,
      current.partner_id as string | null,
    );
    if (!["draft", "scheduled"].includes(current.status as string)) {
      throw new MpError("BROADCASTS.NOT_CANCELLABLE", `Status is '${current.status}'`, 409);
    }
    const { data, error } = await supabase
      .from("broadcasts")
      .update({ status: "cancelled" } as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new MpError("BROADCASTS.CANCEL_FAILED", error.message, 500);
    return mapBroadcast(data);
  });
}
