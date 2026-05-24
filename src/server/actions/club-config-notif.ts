"use server";

import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import type {
  NotificacionesData,
  NotifChannel,
  NotifTarget,
} from "@/components/dashboard/owner/config-sections/NotificacionesSection";

const EVENT_KEYS = [
  "res_new",
  "res_rem",
  "res_rem1",
  "res_cancel",
  "pay_ok",
  "rain",
  "event_new",
  "membership",
] as const;
type EventKey = (typeof EVENT_KEYS)[number];

const CHANNELS: NotifChannel[] = ["push", "email", "sms", "wa"];

const DEFAULT_EVENTS = [
  { key: "res_new" as const, label: "Reserva confirmada", sub: "Cuando se completa el pago", critical: true },
  { key: "res_rem" as const, label: "Recordatorio 24h", sub: "24 horas antes del juego", critical: false },
  { key: "res_rem1" as const, label: "Recordatorio 1h", sub: "1 hora antes del juego", critical: false },
  { key: "res_cancel" as const, label: "Reserva cancelada", sub: "Por el jugador o por el club", critical: true },
  { key: "pay_ok" as const, label: "Pago recibido", sub: "Confirmación a la caja", critical: false },
  { key: "rain" as const, label: "Cierre por lluvia", sub: "Cuando el sensor activa", critical: true },
  { key: "event_new" as const, label: "Inscripción a evento", sub: "Nuevo participante", critical: false },
  { key: "membership" as const, label: "Renovación de membresía", sub: "7 días antes de vencer", critical: false },
];

const TEMPLATE_MINIMAL: Record<EventKey, Record<NotifChannel, NotifTarget>> = {
  res_new: { push: "all", email: "all", sms: "off", wa: "off" },
  res_rem: { push: "all", email: "off", sms: "off", wa: "off" },
  res_rem1: { push: "all", email: "off", sms: "off", wa: "off" },
  res_cancel: { push: "all", email: "all", sms: "off", wa: "off" },
  pay_ok: { push: "staff", email: "off", sms: "off", wa: "off" },
  rain: { push: "all", email: "off", sms: "off", wa: "off" },
  event_new: { push: "staff", email: "off", sms: "off", wa: "off" },
  membership: { push: "all", email: "off", sms: "off", wa: "off" },
};

const TEMPLATE_COMPLETE: Record<EventKey, Record<NotifChannel, NotifTarget>> = {
  res_new: { push: "staff", email: "all", sms: "off", wa: "all" },
  res_rem: { push: "all", email: "all", sms: "off", wa: "all" },
  res_rem1: { push: "all", email: "off", sms: "all", wa: "off" },
  res_cancel: { push: "all", email: "all", sms: "all", wa: "all" },
  pay_ok: { push: "staff", email: "staff", sms: "off", wa: "off" },
  rain: { push: "all", email: "all", sms: "all", wa: "all" },
  event_new: { push: "staff", email: "staff", sms: "off", wa: "off" },
  membership: { push: "all", email: "all", sms: "off", wa: "all" },
};

async function requireClubManagerUserId(clubId: string): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
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
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff role required");
  return user.id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadNotifData(supabase: SupabaseClient<any>, clubId: string): Promise<NotificacionesData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data } = await db
    .from("club_notification_prefs")
    .select("event_key,channel,target")
    .eq("club_id", clubId);

  const matrix: Record<string, Record<NotifChannel, NotifTarget>> = {};
  for (const e of DEFAULT_EVENTS) {
    matrix[e.key] = { push: "off", email: "off", sms: "off", wa: "off" };
  }
  for (const row of (data ?? []) as Array<{ event_key: string; channel: NotifChannel; target: NotifTarget }>) {
    const k = row.event_key;
    const ch = row.channel;
    const tg = row.target;
    if (!matrix[k]) matrix[k] = { push: "off", email: "off", sms: "off", wa: "off" };
    matrix[k][ch] = tg;
  }
  return { clubId, events: DEFAULT_EVENTS, matrix };
}

const EventKeySchema = z.enum(EVENT_KEYS);
const ChannelSchema = z.enum(["push", "email", "sms", "wa"]);
const TargetSchema = z.enum(["all", "staff", "off"]);

const UpdatePrefSchema = z.object({
  clubId: UuidSchema,
  eventKey: EventKeySchema,
  channel: ChannelSchema,
  target: TargetSchema,
});

export async function updateNotifPref(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(UpdatePrefSchema, input, async ({ clubId, eventKey, channel, target }) => {
    const userId = await requireClubManagerUserId(clubId);
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    const { error } = await db
      .from("club_notification_prefs")
      .upsert(
        { club_id: clubId, event_key: eventKey, channel, target },
        { onConflict: "club_id,event_key,channel" },
      );
    if (error) throw new MpError("NOTIF.PREF_UPDATE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

const TemplateSchema = z.object({
  clubId: UuidSchema,
  template: z.enum(["minimal", "complete"]),
});

export async function applyNotifTemplate(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(TemplateSchema, input, async ({ clubId, template }) => {
    const userId = await requireClubManagerUserId(clubId);
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;

    const set = template === "minimal" ? TEMPLATE_MINIMAL : TEMPLATE_COMPLETE;
    const rows: Array<{
      club_id: string;
      event_key: string;
      channel: NotifChannel;
      target: NotifTarget;
    }> = [];
    for (const ek of EVENT_KEYS) {
      for (const ch of CHANNELS) {
        rows.push({ club_id: clubId, event_key: ek, channel: ch, target: set[ek][ch] });
      }
    }
    const { error } = await db
      .from("club_notification_prefs")
      .upsert(rows, { onConflict: "club_id,event_key,channel" });
    if (error) throw new MpError("NOTIF.TEMPLATE_APPLY_FAILED", error.message, 500);
    return { ok: true as const };
  });
}
