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

// Filtros de audiencia soportados (type-safe contra columnas reales de profiles
// + role_assignments). Lo que no mapea a datos reales NO se ofrece (sin fakear).
type TargetFilter = {
  city?: string;
  sport?: string;
  plan?: string;
  role?: string;
  audience?: "team_captains";
};

async function resolvePlatformTargetIds(
  admin: ReturnType<typeof getAdminClient>,
  tf: TargetFilter,
  limit: number,
): Promise<string[]> {
  let ownerIds: string[] | null = null;
  if (tf.role === "owner") {
    const { data } = await admin.from("role_assignments").select("user_id").eq("role", "owner").is("revoked_at", null);
    ownerIds = Array.from(new Set((data ?? []).map((r) => r.user_id as string)));
    if (ownerIds.length === 0) return [];
  }
  // audience='team_captains' (mig 164/165 + admin teams) — captains de teams active.
  let captainIds: string[] | null = null;
  if (tf.audience === "team_captains") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (admin as any)
      .from("teams")
      .select("captain_id")
      .eq("status", "active");
    captainIds = Array.from(
      new Set(
        ((data ?? []) as Array<{ captain_id: string }>).map((r) => r.captain_id),
      ),
    );
    if (captainIds.length === 0) return [];
  }
  let q = admin.from("profiles").select("id").eq("is_system", false);
  if (tf.city) q = q.ilike("city", tf.city);
  if (tf.sport) q = q.eq("preferred_sport", tf.sport as never);
  if (tf.plan === "premium") q = q.eq("plan_tier", "premium");
  if (ownerIds) q = q.in("id", ownerIds);
  if (captainIds) q = q.in("id", captainIds);
  const { data } = await q.limit(limit);
  return (data ?? []).map((r) => r.id as string);
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

// ── dispatchBroadcast ──────────────────────────────────────────────────
// Fan-out de un broadcast existente: query targets según scope, llama
// notify() por cada uno, registra broadcast_recipients y marca status=sent.
// Cap de seguridad: BATCH_LIMIT users por dispatch para no DoS-earnos a
// nosotros mismos en producción. Si querés mandar a más, dividilo o
// implementá worker.
const BATCH_LIMIT = 1000;

export async function dispatchBroadcast(
  input: unknown,
): Promise<ActionResult<{ id: string; sent: number; status: string }>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const { data: bc } = await supabase
      .from("broadcasts")
      .select("id,scope,club_id,partner_id,title,body,status,channels,target_filter")
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

    // Resolve target user_ids según scope.
    const admin = getAdminClient();
    await setAuditActor(admin, callerId, "admin");

    let targets: string[] = [];
    if (bc.scope === "platform") {
      // Aplica el target_filter real (ciudad/deporte/plan/owner) en vez de
      // mandar a todos. Filtro vacío = todos los usuarios no-sistema.
      targets = await resolvePlatformTargetIds(admin, (bc.target_filter ?? {}) as TargetFilter, BATCH_LIMIT);
    } else if (bc.scope === "club") {
      // Clientes del club = organizers de reservations + members si existieran.
      const { data } = await admin
        .from("reservations")
        .select("organizer_id")
        .eq("club_id", bc.club_id as string)
        .not("organizer_id", "is", null);
      targets = Array.from(
        new Set(((data ?? []).map((r) => r.organizer_id as string | null).filter(Boolean) as string[])),
      ).slice(0, BATCH_LIMIT);
    } else if (bc.scope === "partner") {
      // Inscritos en torneos del partner.
      const { data: tIds } = await admin
        .from("tournaments")
        .select("id")
        .eq("partner_id", bc.partner_id as string);
      const tournamentIds = (tIds ?? []).map((t) => t.id as string);
      if (tournamentIds.length === 0) {
        targets = [];
      } else {
        const { data: regs } = await admin
          .from("registrations")
          .select("player_ids")
          .in("tournament_id", tournamentIds);
        const set = new Set<string>();
        for (const r of regs ?? []) {
          for (const pid of (r.player_ids as string[] | null) ?? []) set.add(pid);
        }
        targets = Array.from(set).slice(0, BATCH_LIMIT);
      }
    }

    if (targets.length === 0) {
      // Marca igualmente como sent — no hay nadie a quien notificar, pero
      // tampoco es error. Status sent con sent=0.
      await admin
        .from("broadcasts")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: "sent", sent_at: new Date().toISOString() } as any)
        .eq("id", id);
      return { id, sent: 0, status: "sent" };
    }

    // Fan-out: notify() por cada user, registra recipient. Errores
    // individuales no rompen el batch (notify ya no lanza).
    const role = "user" as const;
    const recipientRows: Array<{ broadcast_id: string; user_id: string; notification_id: string | null }> = [];
    for (const userId of targets) {
      const notifId = await notify({
        userId,
        role,
        kind: "broadcast",
        title: bc.title as string,
        body: bc.body as string,
        payload: { broadcastId: id },
      });
      recipientRows.push({ broadcast_id: id, user_id: userId, notification_id: notifId });
    }

    if (recipientRows.length > 0) {
      // Inserta en chunks de 500 para evitar payloads grandes.
      for (let i = 0; i < recipientRows.length; i += 500) {
        const chunk = recipientRows.slice(i, i + 500);
        await admin
          .from("broadcast_recipients")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(chunk as any);
      }
    }

    await admin
      .from("broadcasts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: "sent", sent_at: new Date().toISOString() } as any)
      .eq("id", id);

    return { id, sent: targets.length, status: "sent" };
  });
}
