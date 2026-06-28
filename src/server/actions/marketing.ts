"use server";

// Marketing broadcasts. Sending = enqueue + later dispatcher fan-out.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { notify } from "@/server/notifications/dispatch";
import {
  executeBroadcastDispatch,
  resolvePlatformTargetIds,
  BROADCAST_BATCH_LIMIT,
  type TargetFilter,
} from "@/server/marketing/dispatch-broadcast-core";
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

// Conteo real de alcance para un target_filter (composer de Comunicaciones).
export async function countAudience(input: unknown): Promise<ActionResult<{ count: number }>> {
  return runAction(z.object({ targetFilter: z.record(z.string(), z.unknown()).default({}) }), input, async ({ targetFilter }) => {
    await assertCanBroadcast("platform");
    const admin = getAdminClient();
    const ids = await resolvePlatformTargetIds(admin, targetFilter as TargetFilter, 100000);
    return { count: ids.length };
  });
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

// Reanuda una campaña pausada (status=cancelled) o activa un borrador:
// despacha notificaciones in-app y marca como enviada.
export async function activateBroadcast(input: unknown): Promise<ActionResult<Broadcast>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const { data: current } = await supabase
      .from("broadcasts")
      .select("scope,club_id,partner_id,status,payload")
      .eq("id", id)
      .single();
    if (!current) throw new MpError("BROADCASTS.NOT_FOUND", "Broadcast not found", 404);
    const userId = await assertCanBroadcast(
      current.scope as "platform" | "club" | "partner",
      current.club_id as string | null,
      current.partner_id as string | null,
    );
    if (!["cancelled", "draft"].includes(current.status as string)) {
      throw new MpError("BROADCASTS.NOT_ACTIVATABLE", `Status is '${current.status}'`, 409);
    }

    if (current.status === "cancelled") {
      const { error: resetErr } = await supabase
        .from("broadcasts")
        .update({ status: "draft" } as never)
        .eq("id", id);
      if (resetErr) throw new MpError("BROADCASTS.ACTIVATE_FAILED", resetErr.message, 500);
    }

    const dispatch = await executeBroadcastDispatch(id, userId);

    const prevPayload = (current.payload as Record<string, unknown> | null) ?? {};
    const newPayload = { ...prevPayload, tag: "EN VIVO" };
    const { data, error } = await supabase
      .from("broadcasts")
      .update({ payload: newPayload } as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new MpError("BROADCASTS.ACTIVATE_FAILED", error.message, 500);

    const row = data ?? { ...current, status: "sent", payload: newPayload };
    return mapBroadcast({ ...row, status: dispatch.status });
  });
}

// ── dispatchBroadcast ──────────────────────────────────────────────────
export async function dispatchBroadcast(
  input: unknown,
): Promise<ActionResult<{ id: string; sent: number; status: string }>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const { data: bc } = await supabase
      .from("broadcasts")
      .select("id,scope,club_id,partner_id,status")
      .eq("id", id)
      .single();
    if (!bc) throw new MpError("BROADCASTS.NOT_FOUND", "Broadcast not found", 404);
    const callerId = await assertCanBroadcast(
      bc.scope as "platform" | "club" | "partner",
      bc.club_id as string | null,
      bc.partner_id as string | null,
    );
    if (!["draft", "scheduled"].includes(bc.status as string)) {
      throw new MpError(
        "BROADCASTS.NOT_DISPATCHABLE",
        `Status is '${bc.status}'; solo draft/scheduled se pueden enviar`,
        409,
      );
    }

    const result = await executeBroadcastDispatch(id, callerId);
    return { id: result.id, sent: result.sent, status: result.status };
  });
}

// ── resendToNonOpeners ─────────────────────────────────────────────────
// Re-envía una campaña ya enviada SOLO a los destinatarios que no la abrieron
// (broadcast_recipients.opened_at IS NULL). Reusa notify(); la apertura del
// re-envío marca opened_at en la fila original (markNotificationRead matchea
// por broadcastId), así que el open-rate se mantiene consistente. Cap de
// seguridad BATCH_LIMIT. Solo para campañas status=sent.
export async function resendToNonOpeners(
  input: unknown,
): Promise<ActionResult<{ resent: number }>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const { data: bc } = await supabase
      .from("broadcasts")
      .select("id,scope,club_id,partner_id,title,body,status")
      .eq("id", id)
      .single();
    if (!bc) throw new MpError("BROADCASTS.NOT_FOUND", "Broadcast not found", 404);
    const callerId = await assertCanBroadcast(
      bc.scope as "platform" | "club" | "partner",
      bc.club_id as string | null,
      bc.partner_id as string | null,
    );
    if (bc.status !== "sent") {
      throw new MpError("BROADCASTS.NOT_RESENDABLE", "Solo se pueden re-enviar campañas ya enviadas", 409);
    }

    const admin = getAdminClient();
    await setAuditActor(admin, callerId, "admin");
    const { data: recs } = await admin
      .from("broadcast_recipients")
      .select("user_id,opened_at")
      .eq("broadcast_id", id);
    // Database types no incluyen broadcast_recipients.opened_at (mig 164 aún sin
    // regenerar en types.ts); se castea vía unknown como en el loader.
    const nonOpeners = ((recs ?? []) as unknown as Array<{ user_id: string; opened_at: string | null }>)
      .filter((r) => !r.opened_at)
      .map((r) => r.user_id)
      .slice(0, BROADCAST_BATCH_LIMIT);
    if (nonOpeners.length === 0) return { resent: 0 };

    const FAN_CHUNK = 50;
    for (let i = 0; i < nonOpeners.length; i += FAN_CHUNK) {
      const chunk = nonOpeners.slice(i, i + FAN_CHUNK);
      await Promise.all(
        chunk.map((userId) =>
          notify({
            userId,
            role: "user",
            kind: "broadcast",
            title: bc.title as string,
            body: bc.body as string,
            payload: { broadcastId: id, resend: true },
          }),
        ),
      );
    }
    return { resent: nonOpeners.length };
  });
}
