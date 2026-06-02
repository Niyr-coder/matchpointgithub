"use server";

// Admin · agregados básicos de paywall_events (mig 171) para empezar a leer el
// funnel de conversión de paywalls/pricing. Versión 1: cuenta por event_name
// últimos 30 días, sin gráficos. Cuando los flags `paywall_enforce_*` (mig 172)
// empiecen a estar ON, esta vista será el primer lugar donde ver el impacto.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";

async function requireAdminUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere rol admin");
  return user.id;
}

export type PaywallEventBucket = {
  eventName: string;
  count: number;
  uniqueUsers: number;
  uniqueSessions: number;
};

export type PaywallFunnelSummary = {
  totalEvents: number;
  uniqueUsers: number;
  uniqueSessions: number;
  uniqueActors: number;
  buckets: PaywallEventBucket[];
  windowDays: number;
};

const WindowSchema = z.object({
  days: z.number().int().min(1).max(365).default(30).optional(),
});

// listPaywallFunnelAdmin: agrupa eventos por nombre últimos N días.
// Versión 1 hace los buckets en memoria. Si el volumen crece, mover a una vista
// materializada o función SQL con índices sobre (event_name, occurred_at).
export async function listPaywallFunnelAdmin(
  input: unknown,
): Promise<ActionResult<PaywallFunnelSummary>> {
  return runAction(WindowSchema, input, async ({ days }) => {
    await requireAdminUserId();
    const admin = getAdminClient();
    const windowDays = days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - windowDays);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("paywall_events")
      .select("event_name, user_id, session_id, occurred_at")
      .gte("occurred_at", since.toISOString())
      .limit(50000);

    if (error) throw new MpError("PAYWALL_FUNNEL.QUERY_FAILED", error.message, 500);

    const rows = (data ?? []) as Array<{
      event_name: string;
      user_id: string | null;
      session_id: string | null;
    }>;

    const byEvent = new Map<string, { count: number; users: Set<string>; sessions: Set<string> }>();
    const allUsers = new Set<string>();
    const allSessions = new Set<string>();
    const allActors = new Set<string>();

    for (const r of rows) {
      const bucket = byEvent.get(r.event_name) ?? {
        count: 0,
        users: new Set<string>(),
        sessions: new Set<string>(),
      };
      bucket.count += 1;
      if (r.user_id) {
        bucket.users.add(r.user_id);
        allUsers.add(r.user_id);
        allActors.add(`u:${r.user_id}`);
      } else if (r.session_id) {
        allActors.add(`s:${r.session_id}`);
      }
      if (r.session_id) {
        bucket.sessions.add(r.session_id);
        allSessions.add(r.session_id);
      }
      byEvent.set(r.event_name, bucket);
    }

    const buckets: PaywallEventBucket[] = Array.from(byEvent.entries())
      .map(([eventName, b]) => ({
        eventName,
        count: b.count,
        uniqueUsers: b.users.size,
        uniqueSessions: b.sessions.size,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalEvents: rows.length,
      uniqueUsers: allUsers.size,
      uniqueSessions: allSessions.size,
      uniqueActors: allActors.size,
      buckets,
      windowDays,
    };
  });
}
