"use server";

// Server actions de la sección Tarifas del Club Config v2.
// Componentes:
//   - Matriz court_pricing read-only: agrupa bandas activas por
//     (sport, indoor) × slot_kind (morning/afternoon/peak/weekend).
//     El edit real ocurre en Canchas → Tarifas (ClubCanchasScreenView).
//   - Tiers: thin wrappers sobre los actions ya existentes en
//     club-memberships.ts (saveClubMembershipTier, deleteClubMembershipTier).
//     Mapeo del DB shape al MembershipTier del section.
//   - Surge: peak_surge_enabled / peak_surge_pct en club_settings (existen).
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import {
  saveClubMembershipTier,
  deleteClubMembershipTier,
} from "@/server/actions/club-memberships";
import type {
  TarifasData,
  TarifaRow,
  TarifaCell,
  MembershipTier,
} from "@/components/dashboard/owner/config-sections/TarifasSection";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
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
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el staff del club puede editar");
  return userId;
}

type SlotKind = "morning" | "afternoon" | "peak" | "weekend";

// Mapea una band (day_of_week + starts_at + ends_at) a un slot_kind con
// prioridad weekend > peak > afternoon > morning. Devuelve null si no encaja
// en ninguna ventana (band rara, ej madrugada 02-05).
function classifySlot(
  dayOfWeek: number | null,
  startsAt: string,
  endsAt: string,
): SlotKind | null {
  const isWeekendOnly = dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeekendOnly) return "weekend";
  const startH = parseInt(startsAt.slice(0, 2), 10);
  const endH = parseInt(endsAt.slice(0, 2), 10);
  const mid = (startH + endH) / 2;
  if (mid >= 17 && mid <= 22) return "peak";
  if (mid >= 12 && mid < 17) return "afternoon";
  if (mid >= 6 && mid < 12) return "morning";
  return null;
}

function courtKindLabel(sport: string, indoor: boolean): { label: string; sub: string; color: string } {
  const sportLabel = sport.charAt(0).toUpperCase() + sport.slice(1);
  if (indoor) {
    return { label: `${sportLabel} indoor`, sub: "Canchas techadas", color: "#0a0a0a" };
  }
  return { label: `${sportLabel} outdoor`, sub: "Canchas al aire libre", color: "#10b981" };
}

export async function loadTarifasData(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  clubId: string,
): Promise<TarifasData | null> {
  // 1. Surge desde club_settings.
  const { data: settings } = await (supabase as any)
    .from("club_settings")
    .select("peak_surge_enabled,peak_surge_pct")
    .eq("club_id", clubId)
    .maybeSingle();

  // 2. Matriz: courts del club → court_pricing activos → group by (sport,indoor)×slot.
  const { data: courts } = await (supabase as any)
    .from("courts")
    .select("id,sport,indoor")
    .eq("club_id", clubId)
    .eq("active", true);
  const courtList = ((courts ?? []) as Array<{ id: string; sport: string; indoor: boolean }>);
  const courtIndex = new Map<string, { sport: string; indoor: boolean }>();
  for (const c of courtList) courtIndex.set(c.id, { sport: c.sport, indoor: c.indoor });

  let bands: Array<{ court_id: string; day_of_week: number | null; starts_at: string; ends_at: string; price_cents: number }> = [];
  if (courtList.length > 0) {
    const { data } = await (supabase as any)
      .from("court_pricing")
      .select("court_id,day_of_week,starts_at,ends_at,price_cents")
      .in("court_id", courtList.map((c) => c.id))
      .eq("active", true);
    bands = (data ?? []) as typeof bands;
  }

  // group: kindKey ("sport|indoor") → slot → number[]
  const groups = new Map<string, { sport: string; indoor: boolean; slots: Record<SlotKind, number[]> }>();
  for (const b of bands) {
    const c = courtIndex.get(b.court_id);
    if (!c) continue;
    const slot = classifySlot(b.day_of_week, b.starts_at, b.ends_at);
    if (!slot) continue;
    const key = `${c.sport}|${c.indoor ? "1" : "0"}`;
    let g = groups.get(key);
    if (!g) {
      g = { sport: c.sport, indoor: c.indoor, slots: { morning: [], afternoon: [], peak: [], weekend: [] } };
      groups.set(key, g);
    }
    g.slots[slot].push(b.price_cents);
  }

  // Si no hay bands aún pero sí canchas, mostramos las filas (sport,indoor) con 0
  // para que el owner vea que tiene que configurar tarifas.
  if (groups.size === 0 && courtList.length > 0) {
    const seen = new Set<string>();
    for (const c of courtList) {
      const key = `${c.sport}|${c.indoor ? "1" : "0"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      groups.set(key, { sport: c.sport, indoor: c.indoor, slots: { morning: [], afternoon: [], peak: [], weekend: [] } });
    }
  }

  const avg = (arr: number[]): number => (arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : 0);
  const rows: TarifaRow[] = [];
  for (const [key, g] of groups) {
    const meta = courtKindLabel(g.sport, g.indoor);
    const prices: TarifaCell = {
      morningCents: avg(g.slots.morning),
      afternoonCents: avg(g.slots.afternoon),
      peakCents: avg(g.slots.peak),
      weekendCents: avg(g.slots.weekend),
    };
    rows.push({ key, label: meta.label, sub: meta.sub, color: meta.color, prices });
  }
  rows.sort((a, b) => a.label.localeCompare(b.label));

  // 3. Tiers desde club_membership_tiers (DB shape → MembershipTier shape).
  const { data: tierRows } = await (supabase as any)
    .from("club_membership_tiers")
    .select("id,name,price_cents,duration_months,discount_pct,benefits,card_design,sort_order,is_active")
    .eq("club_id", clubId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const tierList = (tierRows ?? []) as Array<Record<string, any>>;

  // member_count derivado: count(*) por tier_id en club_memberships activos.
  const tierIds = tierList.map((t) => t.id as string);
  const memberCounts = new Map<string, number>();
  if (tierIds.length > 0) {
    const { data: memRows } = await (supabase as any)
      .from("club_memberships")
      .select("tier_id")
      .eq("club_id", clubId)
      .eq("status", "active")
      .in("tier_id", tierIds);
    for (const m of (memRows ?? []) as Array<{ tier_id: string }>) {
      memberCounts.set(m.tier_id, (memberCounts.get(m.tier_id) ?? 0) + 1);
    }
  }

  const tierDefaultColors = ["#10b981", "#0a0a0a", "#fbbf24"];
  const tiers: MembershipTier[] = tierList.map((t, idx) => {
    const cardDesign = (t.card_design ?? {}) as Record<string, unknown>;
    const benefitsRaw = t.benefits;
    const benefits = Array.isArray(benefitsRaw)
      ? (benefitsRaw as unknown[]).map((v) => (typeof v === "string" ? v : String(v)))
      : [];
    const duration = (t.duration_months as number) || 1;
    const monthly = Math.round((t.price_cents as number) / Math.max(duration, 1));
    const color =
      typeof cardDesign.color === "string" && cardDesign.color.length > 0
        ? (cardDesign.color as string)
        : tierDefaultColors[idx % tierDefaultColors.length];
    const popular = cardDesign.popular === true;
    return {
      id: t.id as string,
      name: t.name as string,
      priceMonthlyCents: monthly,
      discountPct: (t.discount_pct as number) ?? 0,
      benefits,
      color,
      activeCount: memberCounts.get(t.id as string) ?? 0,
      popular,
    };
  });

  return {
    rows,
    tiers,
    peakSurgeEnabled: Boolean(settings?.peak_surge_enabled ?? false),
    peakSurgePct: (settings?.peak_surge_pct as number | null) ?? 20,
  };
}

// ── Tiers: thin wrappers sobre club-memberships.ts ──────────────────────
// El section trabaja con el shape simplificado MembershipTier; aquí lo
// traducimos al input del action existente.

const UpsertTierSchema = z.object({
  clubId: UuidSchema,
  tierId: UuidSchema.optional(),
  name: z.string().trim().min(2).max(60),
  priceMonthlyCents: z.coerce.number().int().min(0).max(100_000_000),
  durationMonths: z.coerce.number().int().min(1).max(60).default(1),
  discountPct: z.coerce.number().int().min(0).max(100).default(0),
  benefits: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  color: z.string().trim().max(40).optional(),
  popular: z.boolean().optional(),
});

export async function upsertMembershipTier(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(UpsertTierSchema, input, async (d) => {
    // Delegamos a saveClubMembershipTier — gatea auth/RLS via mp_club_staff.
    const result = await saveClubMembershipTier({
      clubId: d.clubId,
      tierId: d.tierId,
      name: d.name,
      priceCents: d.priceMonthlyCents * d.durationMonths,
      durationMonths: d.durationMonths,
      discountPct: d.discountPct,
      benefits: d.benefits,
      cardTemplateKey: "default",
      cardAccent: d.color ?? null,
      isActive: true,
    });
    if (!result.ok) {
      throw new MpError(result.error.code, result.error.message, 400);
    }
    // Persistir color + popular en card_design (saveClubMembershipTier los
    // sobrescribe con templateKey+accent; aplicamos parche directo).
    const supabase = await getServerClient();
    await requireClubManagerUserId(d.clubId);
    const cardDesign: Record<string, unknown> = { templateKey: "default" };
    if (d.color) cardDesign.color = d.color;
    if (typeof d.popular === "boolean") cardDesign.popular = d.popular;
    await (supabase as any)
      .from("club_membership_tiers")
      .update({ card_design: cardDesign })
      .eq("id", result.data.id)
      .eq("club_id", d.clubId);
    return { id: result.data.id };
  });
}

const DeleteTierSchema = z.object({ tierId: UuidSchema });

export async function deleteMembershipTier(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(DeleteTierSchema, input, async ({ tierId }) => {
    const result = await deleteClubMembershipTier({ tierId });
    if (!result.ok) throw new MpError(result.error.code, result.error.message, 400);
    return { ok: true as const };
  });
}

// ── court_pricing matriz: edit redirige a Canchas → Tarifas ─────────────
// updateCourtPricing existe como stub que devuelve un error semántico
// porque la edición real vive en ClubCanchasScreenView. La incluimos
// para cumplir el contrato del ticket; si en el futuro queremos edit
// inline desde Tarifas, acá iría la lógica.

const UpdateCourtPricingSchema = z.object({
  clubId: UuidSchema,
  courtKind: z.string().min(1),
  slotKind: z.enum(["morning", "afternoon", "peak", "weekend"]),
  priceCents: z.number().int().min(0),
});

export async function updateCourtPricing(
  input: unknown,
): Promise<ActionResult<{ ok: true; redirect: string }>> {
  return runAction(UpdateCourtPricingSchema, input, async ({ clubId }) => {
    await requireClubManagerUserId(clubId);
    throw new MpError(
      "CLUB_CONFIG.PRICING_REDIRECT",
      "Edita las tarifas por cancha desde Canchas → Tarifas",
      409,
    );
  });
}

// ── Surge: peak_surge_enabled + peak_surge_pct ──────────────────────────
const UpdatePeakSurgeSchema = z.object({
  clubId: UuidSchema,
  enabled: z.boolean(),
  pct: z.coerce.number().int().min(0).max(200).optional(),
});

export async function updatePeakSurge(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(UpdatePeakSurgeSchema, input, async (d) => {
    await requireClubManagerUserId(d.clubId);
    const supabase = await getServerClient();
    const patch: Record<string, unknown> = { peak_surge_enabled: d.enabled };
    if (typeof d.pct === "number") patch.peak_surge_pct = d.pct;
    // upsert defensivo: si el club aún no tiene row en club_settings, la crea.
    const { error } = await (supabase as any)
      .from("club_settings")
      .upsert({ club_id: d.clubId, ...patch }, { onConflict: "club_id" });
    if (error) throw new MpError("CLUB_CONFIG.SURGE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}
