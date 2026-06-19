// Core de fan-out de broadcasts (manual + cron). Sin auth — el caller valida.
import "server-only";

import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { notify } from "@/server/notifications/dispatch";

export const BROADCAST_BATCH_LIMIT = 1000;

export type TargetFilter = {
  city?: string;
  sport?: string;
  plan?: string;
  role?: string;
  audience?: "team_captains";
};

type BroadcastRow = {
  id: string;
  scope: string;
  club_id: string | null;
  partner_id: string | null;
  title: string;
  body: string;
  status: string;
  target_filter: Record<string, unknown> | null;
  created_by: string | null;
};

export async function resolvePlatformTargetIds(
  admin: ReturnType<typeof getAdminClient>,
  tf: TargetFilter,
  limit: number,
): Promise<string[]> {
  let ownerIds: string[] | null = null;
  if (tf.role === "owner") {
    const { data } = await admin
      .from("role_assignments")
      .select("user_id")
      .eq("role", "owner")
      .is("revoked_at", null);
    ownerIds = Array.from(new Set((data ?? []).map((r) => r.user_id as string)));
    if (ownerIds.length === 0) return [];
  }

  let captainIds: string[] | null = null;
  if (tf.audience === "team_captains") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (admin as any)
      .from("teams")
      .select("captain_id")
      .eq("status", "active");
    captainIds = Array.from(
      new Set(((data ?? []) as Array<{ captain_id: string }>).map((r) => r.captain_id)),
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

async function resolveBroadcastTargets(
  admin: ReturnType<typeof getAdminClient>,
  bc: BroadcastRow,
): Promise<string[]> {
  if (bc.scope === "platform") {
    return resolvePlatformTargetIds(
      admin,
      (bc.target_filter ?? {}) as TargetFilter,
      BROADCAST_BATCH_LIMIT,
    );
  }
  if (bc.scope === "club") {
    const { data } = await admin
      .from("reservations")
      .select("organizer_id")
      .eq("club_id", bc.club_id as string)
      .not("organizer_id", "is", null);
    return Array.from(
      new Set(
        ((data ?? []).map((r) => r.organizer_id as string | null).filter(Boolean) as string[]),
      ),
    ).slice(0, BROADCAST_BATCH_LIMIT);
  }
  if (bc.scope === "partner") {
    const { data: tIds } = await admin
      .from("tournaments")
      .select("id")
      .eq("partner_id", bc.partner_id as string);
    const tournamentIds = (tIds ?? []).map((t) => t.id as string);
    if (tournamentIds.length === 0) return [];
    const { data: regs } = await admin
      .from("registrations")
      .select("player_ids")
      .in("tournament_id", tournamentIds);
    const set = new Set<string>();
    for (const r of regs ?? []) {
      for (const pid of (r.player_ids as string[] | null) ?? []) set.add(pid);
    }
    return Array.from(set).slice(0, BROADCAST_BATCH_LIMIT);
  }
  return [];
}

export async function listDueScheduledBroadcastIds(limit = 10): Promise<string[]> {
  const admin = getAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("broadcasts")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(`listDueScheduledBroadcastIds: ${error.message}`);
  }
  return (data ?? []).map((r) => r.id as string);
}

export type BroadcastDispatchResult = {
  id: string;
  sent: number;
  status: "sent";
  skipped?: boolean;
  reason?: string;
};

export async function executeBroadcastDispatch(
  broadcastId: string,
  actorUserId: string,
): Promise<BroadcastDispatchResult> {
  const admin = getAdminClient();
  const { data: bc, error: readErr } = await admin
    .from("broadcasts")
    .select(
      "id,scope,club_id,partner_id,title,body,status,target_filter,created_by",
    )
    .eq("id", broadcastId)
    .single();
  if (readErr || !bc) {
    throw new Error(readErr?.message ?? "Broadcast not found");
  }

  const row = bc as BroadcastRow;
  if (!["draft", "scheduled"].includes(row.status)) {
    return {
      id: broadcastId,
      sent: 0,
      status: "sent",
      skipped: true,
      reason: `status=${row.status}`,
    };
  }

  await setAuditActor(admin, actorUserId, "admin");

  const targets = await resolveBroadcastTargets(admin, row);
  if (targets.length === 0) {
    await admin
      .from("broadcasts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: "sent", sent_at: new Date().toISOString() } as any)
      .eq("id", broadcastId);
    return { id: broadcastId, sent: 0, status: "sent" };
  }

  const role = "user" as const;
  const recipientRows: Array<{
    broadcast_id: string;
    user_id: string;
    notification_id: string | null;
  }> = [];
  for (const userId of targets) {
    const notifId = await notify({
      userId,
      role,
      kind: "broadcast",
      title: row.title,
      body: row.body,
      payload: { broadcastId },
    });
    recipientRows.push({ broadcast_id: broadcastId, user_id: userId, notification_id: notifId });
  }

  if (recipientRows.length > 0) {
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
    .eq("id", broadcastId);

  return { id: broadcastId, sent: targets.length, status: "sent" };
}

export async function getBroadcastCreatedBy(broadcastId: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from("broadcasts")
    .select("created_by")
    .eq("id", broadcastId)
    .maybeSingle();
  return (data?.created_by as string | null) ?? null;
}
