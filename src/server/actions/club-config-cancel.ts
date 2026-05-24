"use server";

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import type {
  CancelacionData,
  CancelTier,
  CancelStats,
} from "@/components/dashboard/owner/config-sections/CancelacionSection";

function tierMeta(hours: number, refundPct: number): { label: string; sub: string; color: string } {
  if (hours < 0) {
    return {
      label: "No se presentó",
      sub: "Penalización + bloqueo 24h para reservar",
      color: "#7c1d1d",
    };
  }
  if (hours >= 24) {
    return {
      label: "24 h o más antes",
      sub: "Reembolso íntegro al método de pago",
      color: "var(--primary)",
    };
  }
  if (hours >= 12) {
    return {
      label: "Entre 24 y 12 h",
      sub: `${100 - refundPct}% se queda como crédito MP`,
      color: "#34d399",
    };
  }
  if (hours >= 4) {
    return {
      label: "Entre 12 y 4 h",
      sub: "Mitad como crédito MP, mitad para el club",
      color: "#fbbf24",
    };
  }
  return {
    label: "Menos de 4 h",
    sub: "Sin reembolso — la cancha ya se separó",
    color: "#dc2626",
  };
}

function parseTiers(raw: unknown): CancelTier[] {
  const arr = Array.isArray(raw) ? raw : [];
  const tiers: CancelTier[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const hours = typeof obj.hours === "number" ? obj.hours : null;
    const refundPct = typeof obj.refund_pct === "number" ? obj.refund_pct : null;
    if (hours == null || refundPct == null) continue;
    const meta = tierMeta(hours, refundPct);
    tiers.push({ hours, refundPct, label: meta.label, sub: meta.sub, color: meta.color });
  }
  return tiers;
}

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
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff required");
  return user.id;
}

const NO_SHOW_TIER: CancelTier = {
  hours: -1,
  refundPct: 0,
  ...tierMeta(-1, 0),
};

async function fetchStats(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  clubId: string,
): Promise<CancelStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count: total }, { count: cancellations }, { count: noShows }] = await Promise.all([
    supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId)
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("status", "cancelled")
      .gte("created_at", thirtyDaysAgo),
    supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("status", "no_show")
      .gte("created_at", thirtyDaysAgo),
  ]);
  return {
    reservationsMonth: total ?? 0,
    cancellationsMonth: cancellations ?? 0,
    noShowsMonth: noShows ?? 0,
  };
}

export async function loadCancelData(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  clubId: string,
): Promise<CancelacionData> {
  const { data: settings } = await supabase
    .from("club_settings")
    .select("cancellation_tiers,no_show_penalty_cents")
    .eq("club_id", clubId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (settings ?? {}) as any;
  const tiers = parseTiers(s.cancellation_tiers);
  if (!tiers.some((t) => t.hours < 0)) tiers.push(NO_SHOW_TIER);

  const noShowPenaltyCents =
    typeof s.no_show_penalty_cents === "number" ? s.no_show_penalty_cents : 500;

  const stats = await fetchStats(supabase, clubId);

  // TODO: persistir reglas finas (rain / maintenance / members / groups).
  // Por ahora se renderean con defaults; los toggles viven en memoria del
  // section. Cuando se agregue la columna `cancellation_rules` jsonb a
  // `club_settings`, leerla acá y devolverla.
  const rules = [
    { key: "rain", label: "Lluvia en canchas outdoor", sub: "100% reembolso siempre · automático cuando el sensor activa", enabled: true },
    { key: "maintenance", label: "Cierre por mantenimiento", sub: "Si tú cancelas: 100% reembolso + crédito de 1 hora cortesía", enabled: true },
    { key: "members", label: "Socios Plus / Pro", sub: "Primer no-show del mes sin penalización", enabled: true },
    { key: "groups", label: "Reservas grupales (6+)", sub: "Política especial: 48h para cancelar al 100%", enabled: false },
  ];

  return {
    tiers,
    rules,
    noShowPenaltyCents,
    stats,
  };
}

const TierInputSchema = z.object({
  hours: z.number().int().min(-1).max(168),
  refundPct: z.number().int().min(0).max(100),
});

const UpdatePolicySchema = z.object({
  clubId: UuidSchema,
  tiers: z.array(TierInputSchema).min(1).max(10),
  noShowPenaltyCents: z.number().int().min(0).max(100000),
});

export async function updateCancellationPolicy(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(UpdatePolicySchema, input, async ({ clubId, tiers, noShowPenaltyCents }) => {
    const userId = await requireClubManagerUserId(clubId);
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "owner");

    // Persistimos solo los tiers regulares (hours >= 0); el "no-show"
    // (hours: -1) vive en `no_show_penalty_cents` aparte.
    const regularTiers = tiers
      .filter((t) => t.hours >= 0)
      .map((t) => ({ hours: t.hours, refund_pct: t.refundPct }));

    const { error } = await admin
      .from("club_settings")
      .update({
        cancellation_tiers: regularTiers,
        no_show_penalty_cents: noShowPenaltyCents,
      } as never)
      .eq("club_id", clubId);
    if (error) throw new MpError("CANCEL_POLICY.UPDATE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}
