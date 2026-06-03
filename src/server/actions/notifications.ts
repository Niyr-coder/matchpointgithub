"use server";

// Notifications: the bell feed + preferences. INSERT only happens via
// fn_enqueue_notification (Postgres function); the server layer never
// writes to `notifications` directly.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { requireSession, ACTIVE_ROLE_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";
import {
  NotificationKindSchema,
  NotificationListParamsSchema,
  NotificationPreferenceSchema,
  NotificationSchema,
  UpdatePreferencesSchema,
  type Notification,
} from "@/lib/schemas/notifications";
import { MpRoleSchema, UuidSchema } from "@/lib/schemas/common";
import { enrichNotifications } from "@/server/notifications/enrich";

function mapNotif(row: Record<string, unknown>): Notification {
  return NotificationSchema.parse({
    id: row.id,
    recipientUserId: row.recipient_user_id,
    recipientRole: row.recipient_role,
    kind: row.kind,
    title: row.title,
    body: row.body ?? null,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: row.created_at,
  });
}

async function requireUserId(): Promise<string> {
  // getSession() está envuelto en React.cache: si otra parte del request ya
  // resolvió la sesión, no hace un nuevo auth.getUser(). requireSession lanza
  // AuthError si no hay sesión.
  const session = await requireSession();
  return session.userId;
}

async function activeRole(): Promise<string | null> {
  return (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value ?? null;
}

// ── listMyNotifications ────────────────────────────────────────────────
export async function listMyNotifications(input: unknown): Promise<ActionResult<Notification[]>> {
  return runAction(NotificationListParamsSchema, input, async (params) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const role = params.role ?? (await activeRole());
    let q = supabase
      .from("notifications")
      .select("id, recipient_user_id, recipient_role, kind, title, body, payload, read_at, created_at")
      .eq("recipient_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(params.limit);
    if (role) q = q.eq("recipient_role", role as never);
    if (params.unread) q = q.is("read_at", null);
    const { data, error } = await q;
    if (error) throw new MpError("NOTIFICATIONS.DB_ERROR", error.message, 500);
    const mapped = (data ?? []).map(mapNotif);
    return enrichNotifications(supabase, mapped);
  });
}

// ── markRead ───────────────────────────────────────────────────────────
export async function markNotificationRead(
  input: unknown,
): Promise<ActionResult<Notification>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() } as never)
      .eq("id", id)
      .eq("recipient_user_id", userId)
      .select()
      .single();
    if (error || !data) throw new MpError("NOTIFICATIONS.NOT_FOUND", "Notification not found", 404);
    // Tracking de aperturas: si es una notificación de broadcast, marca opened_at
    // en broadcast_recipients (service role: la RLS no deja al user escribir ahí).
    const payload = (data.payload ?? {}) as Record<string, unknown>;
    if ((data.kind as string) === "broadcast" && typeof payload.broadcastId === "string") {
      await getAdminClient()
        .from("broadcast_recipients")
        .update({ opened_at: new Date().toISOString() } as never)
        .eq("broadcast_id", payload.broadcastId)
        .eq("user_id", userId)
        .is("opened_at", null);
    }
    return mapNotif(data);
  });
}

// ── markAllRead (active role scope) ────────────────────────────────────
export async function markAllNotificationsRead(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  return runAction(
    z.object({ role: MpRoleSchema.optional() }),
    input,
    async ({ role }) => {
      const userId = await requireUserId();
      const supabase = await getServerClient();
      const targetRole = role ?? (await activeRole());
      let q = supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() } as never)
        .eq("recipient_user_id", userId)
        .is("read_at", null);
      if (targetRole) q = q.eq("recipient_role", targetRole as never);
      const { data, error } = await q.select("id");
      if (error) throw new MpError("NOTIFICATIONS.MARK_ALL_FAILED", error.message, 500);
      return { count: (data ?? []).length };
    },
  );
}

// ── dismissNotification (compat: mark as read) ─────────────────────────
// Mantiene el nombre por compatibilidad con /notifications/:id/dismiss.
// La tabla no tiene dismissed_at y RLS no permite DELETE al usuario, así que
// este endpoint solo marca la notificación como leída.
export async function dismissNotification(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() } as never)
      .eq("id", id)
      .eq("recipient_user_id", userId);
    if (error) throw new MpError("NOTIFICATIONS.DISMISS_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── unread count (badge) ───────────────────────────────────────────────
export async function getUnreadCount(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  return runAction(
    z.object({ role: MpRoleSchema.optional() }).optional().default({}),
    input,
    async (params) => {
      const userId = await requireUserId();
      const supabase = await getServerClient();
      const role = params?.role ?? (await activeRole());
      let q = supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", userId)
        .is("read_at", null);
      if (role) q = q.eq("recipient_role", role as never);
      const { count, error } = await q;
      if (error) throw new MpError("NOTIFICATIONS.DB_ERROR", error.message, 500);
      return { count: count ?? 0 };
    },
  );
}

// ── listMyPreferences ──────────────────────────────────────────────────
export async function listMyPreferences(): Promise<
  ActionResult<z.infer<typeof NotificationPreferenceSchema>[]>
> {
  return runAction(z.undefined(), undefined, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId);
    if (error) throw new MpError("NOTIFICATIONS.DB_ERROR", error.message, 500);
    return (data ?? []).map((r) =>
      NotificationPreferenceSchema.parse({
        role: r.role,
        kind: r.kind,
        channel: r.channel,
        enabled: r.enabled,
      }),
    );
  });
}

// ── updatePreferences (batch) ──────────────────────────────────────────
export async function updateMyPreferences(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  return runAction(UpdatePreferencesSchema, input, async ({ items }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const kinds = Array.from(new Set(items.map((i) => i.kind)));
    const { data: catalogRows, error: catalogError } = await supabase
      .from("notification_kinds")
      .select("kind, allowed_roles")
      .in("kind", kinds);
    if (catalogError) throw new MpError("NOTIFICATIONS.DB_ERROR", catalogError.message, 500);

    const catalog = new Map(
      ((catalogRows ?? []) as Array<{ kind: string; allowed_roles: string[] | null }>).map(
        (row) => [row.kind, row.allowed_roles ?? []],
      ),
    );
    for (const item of items) {
      const allowedRoles = catalog.get(item.kind);
      if (!allowedRoles) {
        throw new MpError(
          "NOTIFICATIONS.UNKNOWN_KIND",
          `El tipo de notificación "${item.kind}" no existe.`,
          400,
        );
      }
      if (!allowedRoles.includes(item.role)) {
        throw new MpError(
          "NOTIFICATIONS.ROLE_NOT_ALLOWED",
          `El rol "${item.role}" no puede configurar "${item.kind}".`,
          400,
        );
      }
    }

    const rows = items.map((i) => ({
      user_id: userId,
      role: i.role,
      kind: i.kind,
      channel: i.channel,
      enabled: i.enabled,
    }));
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(rows as never, {
        onConflict: "user_id,role,kind,channel",
        defaultToNull: false,
      });
    if (error) throw new MpError("NOTIFICATIONS.PREFS_FAILED", error.message, 500);
    return { count: rows.length };
  });
}

// ── notification kinds catalog ─────────────────────────────────────────
export async function listNotificationKinds(): Promise<
  ActionResult<z.infer<typeof NotificationKindSchema>[]>
> {
  return runAction(z.undefined(), undefined, async () => {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("notification_kinds")
      .select("*")
      .order("category")
      .order("kind");
    if (error) throw new MpError("NOTIFICATIONS.DB_ERROR", error.message, 500);
    return (data ?? []).map((r) =>
      NotificationKindSchema.parse({
        kind: r.kind,
        description: r.description,
        allowedRoles: r.allowed_roles,
        defaultChannels: r.default_channels,
        category: r.category,
      }),
    );
  });
}
