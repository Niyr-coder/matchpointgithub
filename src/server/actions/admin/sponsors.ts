"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

const ADMIN_SPONSORS_PATH = "/dashboard/admin/admin-sponsors";

type SponsorStatus = "active" | "paused" | "archived";
type PlacementStatus = "draft" | "active" | "paused" | "archived";
type SponsorEventType = "impression" | "click";

export type AdminSponsor = {
  id: string;
  slug: string;
  name: string;
  status: SponsorStatus;
  websiteUrl: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  contactName: string | null;
  contactEmail: string | null;
  billingEmail: string | null;
  contractStartsOn: string | null;
  contractEndsOn: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSponsorSlot = {
  id: string;
  key: string;
  surface: string;
  label: string;
  description: string | null;
  maxActivePlacements: number;
  basePriceCents: number;
  currency: string;
  isActive: boolean;
  activePlacementCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminSponsorPlacement = {
  id: string;
  sponsorId: string;
  sponsorName: string;
  slotId: string;
  slotKey: string;
  slotLabel: string;
  status: PlacementStatus;
  headline: string;
  body: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  targetUrl: string | null;
  priority: number;
  startsAt: string;
  endsAt: string | null;
  contractAmountCents: number;
  currency: string;
  impressions30d: number;
  clicks30d: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminSponsorsData = {
  sponsors: AdminSponsor[];
  slots: AdminSponsorSlot[];
  placements: AdminSponsorPlacement[];
  totals: {
    sponsors: number;
    activeSponsors: number;
    slots: number;
    activePlacements: number;
    bookedAmountCents: number;
    impressions30d: number;
    clicks30d: number;
  };
};

type SponsorRow = {
  id: string;
  slug: string;
  name: string;
  status: SponsorStatus;
  website_url: string | null;
  logo_url: string | null;
  brand_color: string | null;
  contact_name: string | null;
  contact_email: string | null;
  billing_email: string | null;
  contract_starts_on: string | null;
  contract_ends_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type SlotRow = {
  id: string;
  key: string;
  surface: string;
  label: string;
  description: string | null;
  max_active_placements: number;
  base_price_cents: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type PlacementRow = {
  id: string;
  sponsor_id: string;
  slot_id: string;
  status: PlacementStatus;
  headline: string;
  body: string | null;
  image_url: string | null;
  image_alt: string | null;
  target_url: string | null;
  priority: number;
  starts_at: string;
  ends_at: string | null;
  contract_amount_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

type EventCountRow = {
  placement_id: string;
  event_type: SponsorEventType;
};

type TypedAdminClient = ReturnType<typeof getAdminClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseAdminClient = Omit<TypedAdminClient, "from"> & { from: (table: string) => any };

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

function adminClient(): LooseAdminClient {
  return getAdminClient() as LooseAdminClient;
}

async function setAdminAuditActor(admin: LooseAdminClient, adminId: string): Promise<void> {
  await setAuditActor(admin as unknown as TypedAdminClient, adminId, "admin");
}

function requireNoError<T>(label: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data as T;
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function cleanNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const NullableText = z.string().trim().max(2000).nullable().optional();
const NullableUrl = z.string().trim().url().max(1000).nullable().optional();
const NullableEmail = z.string().trim().email().max(320).nullable().optional();
const NullableDate = z.string().trim().max(20).nullable().optional();
const NullableDateTime = z.string().trim().datetime({ offset: true }).nullable().optional();

const SponsorStatusSchema = z.enum(["active", "paused", "archived"]);
const PlacementStatusSchema = z.enum(["draft", "active", "paused", "archived"]);

const SponsorCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(),
  websiteUrl: NullableUrl,
  logoUrl: NullableUrl,
  brandColor: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  contactName: z.string().trim().max(160).nullable().optional(),
  contactEmail: NullableEmail,
  billingEmail: NullableEmail,
  contractStartsOn: NullableDate,
  contractEndsOn: NullableDate,
  notes: NullableText,
});

const SponsorUpdateSchema = z.object({
  sponsorId: UuidSchema,
  patch: SponsorCreateSchema.partial().refine((patch) => Object.keys(patch).length > 0, {
    message: "No hay cambios para guardar",
  }),
});

const SponsorStatusInputSchema = z.object({
  sponsorId: UuidSchema,
  status: SponsorStatusSchema,
});

const SlotCreateSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/).max(80),
  surface: z.string().trim().min(2).max(80),
  label: z.string().trim().min(2).max(120),
  description: NullableText,
  maxActivePlacements: z.coerce.number().int().min(1).max(20),
  basePriceCents: z.coerce.number().int().min(0).max(10_000_000),
  currency: z.string().trim().length(3).default("USD"),
  isActive: z.boolean().default(true),
});

const SlotUpdateSchema = z.object({
  slotId: UuidSchema,
  patch: SlotCreateSchema.partial().refine((patch) => Object.keys(patch).length > 0, {
    message: "No hay cambios para guardar",
  }),
});

const PlacementCreateSchema = z.object({
  sponsorId: UuidSchema,
  slotId: UuidSchema,
  status: PlacementStatusSchema.default("draft"),
  headline: z.string().trim().min(2).max(180),
  body: NullableText,
  imageUrl: NullableUrl,
  imageAlt: z.string().trim().max(180).nullable().optional(),
  targetUrl: NullableUrl,
  priority: z.coerce.number().int().min(-1000).max(1000).default(0),
  startsAt: z.string().trim().datetime({ offset: true }),
  endsAt: NullableDateTime,
  contractAmountCents: z.coerce.number().int().min(0).max(100_000_000).default(0),
  currency: z.string().trim().length(3).default("USD"),
});

const PlacementUpdateSchema = z.object({
  placementId: UuidSchema,
  patch: PlacementCreateSchema.omit({ sponsorId: true, slotId: true }).partial().extend({
    sponsorId: UuidSchema.optional(),
    slotId: UuidSchema.optional(),
  }).refine((patch) => Object.keys(patch).length > 0, {
    message: "No hay cambios para guardar",
  }),
});

const PlacementStatusInputSchema = z.object({
  placementId: UuidSchema,
  status: PlacementStatusSchema,
});

const TrackEventSchema = z.object({
  placementId: UuidSchema,
  eventType: z.enum(["impression", "click"]),
  sessionId: z.string().trim().max(160).nullable().optional(),
  pathname: z.string().trim().max(500).nullable().optional(),
  referrer: z.string().trim().max(1000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function sponsorPayload(input: z.infer<typeof SponsorCreateSchema>, adminId?: string) {
  return {
    name: input.name,
    slug: input.slug ?? slugify(input.name),
    website_url: cleanNullable(input.websiteUrl),
    logo_url: cleanNullable(input.logoUrl),
    brand_color: cleanNullable(input.brandColor),
    contact_name: cleanNullable(input.contactName),
    contact_email: cleanNullable(input.contactEmail),
    billing_email: cleanNullable(input.billingEmail),
    contract_starts_on: cleanNullable(input.contractStartsOn),
    contract_ends_on: cleanNullable(input.contractEndsOn),
    notes: cleanNullable(input.notes),
    ...(adminId ? { created_by: adminId } : {}),
  };
}

function sponsorPatch(input: z.infer<typeof SponsorUpdateSchema>["patch"]) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.slug !== undefined) patch.slug = input.slug;
  if (input.websiteUrl !== undefined) patch.website_url = cleanNullable(input.websiteUrl);
  if (input.logoUrl !== undefined) patch.logo_url = cleanNullable(input.logoUrl);
  if (input.brandColor !== undefined) patch.brand_color = cleanNullable(input.brandColor);
  if (input.contactName !== undefined) patch.contact_name = cleanNullable(input.contactName);
  if (input.contactEmail !== undefined) patch.contact_email = cleanNullable(input.contactEmail);
  if (input.billingEmail !== undefined) patch.billing_email = cleanNullable(input.billingEmail);
  if (input.contractStartsOn !== undefined) patch.contract_starts_on = cleanNullable(input.contractStartsOn);
  if (input.contractEndsOn !== undefined) patch.contract_ends_on = cleanNullable(input.contractEndsOn);
  if (input.notes !== undefined) patch.notes = cleanNullable(input.notes);
  return patch;
}

function placementPayload(input: z.infer<typeof PlacementCreateSchema>, adminId?: string) {
  return {
    sponsor_id: input.sponsorId,
    slot_id: input.slotId,
    status: input.status,
    headline: input.headline,
    body: cleanNullable(input.body),
    image_url: cleanNullable(input.imageUrl),
    image_alt: cleanNullable(input.imageAlt),
    target_url: cleanNullable(input.targetUrl),
    priority: input.priority,
    starts_at: input.startsAt,
    ends_at: cleanNullable(input.endsAt),
    contract_amount_cents: input.contractAmountCents,
    currency: input.currency.toUpperCase(),
    ...(adminId ? { created_by: adminId } : {}),
  };
}

function placementPatch(input: z.infer<typeof PlacementUpdateSchema>["patch"]) {
  const patch: Record<string, unknown> = {};
  if (input.sponsorId !== undefined) patch.sponsor_id = input.sponsorId;
  if (input.slotId !== undefined) patch.slot_id = input.slotId;
  if (input.status !== undefined) patch.status = input.status;
  if (input.headline !== undefined) patch.headline = input.headline;
  if (input.body !== undefined) patch.body = cleanNullable(input.body);
  if (input.imageUrl !== undefined) patch.image_url = cleanNullable(input.imageUrl);
  if (input.imageAlt !== undefined) patch.image_alt = cleanNullable(input.imageAlt);
  if (input.targetUrl !== undefined) patch.target_url = cleanNullable(input.targetUrl);
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
  if (input.endsAt !== undefined) patch.ends_at = cleanNullable(input.endsAt);
  if (input.contractAmountCents !== undefined) patch.contract_amount_cents = input.contractAmountCents;
  if (input.currency !== undefined) patch.currency = input.currency.toUpperCase();
  return patch;
}

function mapSponsor(row: SponsorRow): AdminSponsor {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    websiteUrl: row.website_url,
    logoUrl: row.logo_url,
    brandColor: row.brand_color,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    billingEmail: row.billing_email,
    contractStartsOn: row.contract_starts_on,
    contractEndsOn: row.contract_ends_on,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAdminSponsorsOverview(): Promise<AdminSponsorsData> {
  await requireAdminUserId();
  const admin = adminClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [sponsorsRes, slotsRes, placementsRes, eventsRes] = await Promise.all([
    admin.from("sponsors").select("*").order("name", { ascending: true }),
    admin.from("sponsor_slots").select("*").order("surface", { ascending: true }).order("label", { ascending: true }),
    admin
      .from("sponsor_placements")
      .select("*")
      .order("starts_at", { ascending: false })
      .limit(300),
    admin
      .from("sponsor_placement_events")
      .select("placement_id,event_type")
      .gte("occurred_at", since)
      .limit(10000),
  ]);

  const sponsorsRaw = requireNoError<SponsorRow[]>("sponsors", sponsorsRes);
  const slotsRaw = requireNoError<SlotRow[]>("sponsor_slots", slotsRes);
  const placementsRaw = requireNoError<PlacementRow[]>("sponsor_placements", placementsRes);
  const events = requireNoError<EventCountRow[]>("sponsor_placement_events", eventsRes);

  const sponsorById = new Map(sponsorsRaw.map((s) => [s.id, s]));
  const slotById = new Map(slotsRaw.map((s) => [s.id, s]));
  const eventCounts = new Map<string, { impressions: number; clicks: number }>();
  for (const event of events) {
    const current = eventCounts.get(event.placement_id) ?? { impressions: 0, clicks: 0 };
    if (event.event_type === "impression") current.impressions += 1;
    if (event.event_type === "click") current.clicks += 1;
    eventCounts.set(event.placement_id, current);
  }

  const now = Date.now();
  const isPlacementLive = (placement: PlacementRow): boolean => {
    const starts = new Date(placement.starts_at).getTime();
    const ends = placement.ends_at ? new Date(placement.ends_at).getTime() : Number.POSITIVE_INFINITY;
    const sponsor = sponsorById.get(placement.sponsor_id);
    const slot = slotById.get(placement.slot_id);
    return placement.status === "active" && sponsor?.status === "active" && slot?.is_active === true && starts <= now && ends > now;
  };

  const placements = placementsRaw.map((placement) => {
    const sponsor = sponsorById.get(placement.sponsor_id);
    const slot = slotById.get(placement.slot_id);
    const counts = eventCounts.get(placement.id) ?? { impressions: 0, clicks: 0 };
    return {
      id: placement.id,
      sponsorId: placement.sponsor_id,
      sponsorName: sponsor?.name ?? "Sponsor eliminado",
      slotId: placement.slot_id,
      slotKey: slot?.key ?? "slot_eliminado",
      slotLabel: slot?.label ?? "Slot eliminado",
      status: placement.status,
      headline: placement.headline,
      body: placement.body,
      imageUrl: placement.image_url,
      imageAlt: placement.image_alt,
      targetUrl: placement.target_url,
      priority: placement.priority,
      startsAt: placement.starts_at,
      endsAt: placement.ends_at,
      contractAmountCents: placement.contract_amount_cents,
      currency: placement.currency,
      impressions30d: counts.impressions,
      clicks30d: counts.clicks,
      createdAt: placement.created_at,
      updatedAt: placement.updated_at,
    } satisfies AdminSponsorPlacement;
  });

  const activePlacementBySlot = placementsRaw.reduce((map, placement) => {
    if (isPlacementLive(placement)) map.set(placement.slot_id, (map.get(placement.slot_id) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const sponsors = sponsorsRaw.map(mapSponsor);
  const slots = slotsRaw.map((slot) => ({
    id: slot.id,
    key: slot.key,
    surface: slot.surface,
    label: slot.label,
    description: slot.description,
    maxActivePlacements: slot.max_active_placements,
    basePriceCents: slot.base_price_cents,
    currency: slot.currency,
    isActive: slot.is_active,
    activePlacementCount: activePlacementBySlot.get(slot.id) ?? 0,
    createdAt: slot.created_at,
    updatedAt: slot.updated_at,
  }));

  const totals = {
    sponsors: sponsors.length,
    activeSponsors: sponsors.filter((s) => s.status === "active").length,
    slots: slots.length,
    activePlacements: placementsRaw.filter(isPlacementLive).length,
    bookedAmountCents: placementsRaw.reduce((sum, p) => sum + (p.status === "archived" ? 0 : p.contract_amount_cents), 0),
    impressions30d: events.filter((event) => event.event_type === "impression").length,
    clicks30d: events.filter((event) => event.event_type === "click").length,
  };

  return { sponsors, slots, placements, totals };
}

export async function createSponsor(input: unknown): Promise<ActionResult<{ sponsorId: string }>> {
  return runAction(SponsorCreateSchema, input, async (data) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const payload = sponsorPayload(data, adminId);
    if (!payload.slug) throw new MpError("SPONSORS.INVALID_SLUG", "No se pudo generar un slug válido.", 400);

    const { data: inserted, error } = await admin
      .from("sponsors")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new MpError("SPONSORS.SLUG_EXISTS", "Ese slug ya está usado.", 409);
      throw new MpError("SPONSORS.CREATE_FAILED", error.message, 500);
    }

    revalidatePath(ADMIN_SPONSORS_PATH);
    return { sponsorId: inserted.id as string };
  });
}

export async function updateSponsor(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SponsorUpdateSchema, input, async ({ sponsorId, patch }) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const { error } = await admin.from("sponsors").update(sponsorPatch(patch)).eq("id", sponsorId);
    if (error) {
      if (error.code === "23505") throw new MpError("SPONSORS.SLUG_EXISTS", "Ese slug ya está usado.", 409);
      throw new MpError("SPONSORS.UPDATE_FAILED", error.message, 500);
    }

    revalidatePath(ADMIN_SPONSORS_PATH);
    return { ok: true as const };
  });
}

export async function setSponsorStatus(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SponsorStatusInputSchema, input, async ({ sponsorId, status }) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const { error } = await admin.from("sponsors").update({ status }).eq("id", sponsorId);
    if (error) throw new MpError("SPONSORS.STATUS_FAILED", error.message, 500);

    revalidatePath(ADMIN_SPONSORS_PATH);
    return { ok: true as const };
  });
}

export async function createSponsorSlot(input: unknown): Promise<ActionResult<{ slotId: string }>> {
  return runAction(SlotCreateSchema, input, async (data) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const { data: inserted, error } = await admin
      .from("sponsor_slots")
      .insert({
        key: data.key,
        surface: data.surface,
        label: data.label,
        description: cleanNullable(data.description),
        max_active_placements: data.maxActivePlacements,
        base_price_cents: data.basePriceCents,
        currency: data.currency.toUpperCase(),
        is_active: data.isActive,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new MpError("SPONSORS.SLOT_KEY_EXISTS", "Ese key de slot ya existe.", 409);
      throw new MpError("SPONSORS.SLOT_CREATE_FAILED", error.message, 500);
    }

    revalidatePath(ADMIN_SPONSORS_PATH);
    return { slotId: inserted.id as string };
  });
}

export async function updateSponsorSlot(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(SlotUpdateSchema, input, async ({ slotId, patch }) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const payload: Record<string, unknown> = {};
    if (patch.key !== undefined) payload.key = patch.key;
    if (patch.surface !== undefined) payload.surface = patch.surface;
    if (patch.label !== undefined) payload.label = patch.label;
    if (patch.description !== undefined) payload.description = cleanNullable(patch.description);
    if (patch.maxActivePlacements !== undefined) payload.max_active_placements = patch.maxActivePlacements;
    if (patch.basePriceCents !== undefined) payload.base_price_cents = patch.basePriceCents;
    if (patch.currency !== undefined) payload.currency = patch.currency.toUpperCase();
    if (patch.isActive !== undefined) payload.is_active = patch.isActive;

    const { error } = await admin.from("sponsor_slots").update(payload).eq("id", slotId);
    if (error) {
      if (error.code === "23505") throw new MpError("SPONSORS.SLOT_KEY_EXISTS", "Ese key de slot ya existe.", 409);
      throw new MpError("SPONSORS.SLOT_UPDATE_FAILED", error.message, 500);
    }

    revalidatePath(ADMIN_SPONSORS_PATH);
    return { ok: true as const };
  });
}

export async function createSponsorPlacement(input: unknown): Promise<ActionResult<{ placementId: string }>> {
  return runAction(PlacementCreateSchema, input, async (data) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const { data: inserted, error } = await admin
      .from("sponsor_placements")
      .insert(placementPayload(data, adminId))
      .select("id")
      .single();
    if (error) throw new MpError("SPONSORS.PLACEMENT_CREATE_FAILED", error.message, 500);

    revalidatePath(ADMIN_SPONSORS_PATH);
    return { placementId: inserted.id as string };
  });
}

export async function updateSponsorPlacement(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(PlacementUpdateSchema, input, async ({ placementId, patch }) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const { error } = await admin.from("sponsor_placements").update(placementPatch(patch)).eq("id", placementId);
    if (error) throw new MpError("SPONSORS.PLACEMENT_UPDATE_FAILED", error.message, 500);

    revalidatePath(ADMIN_SPONSORS_PATH);
    return { ok: true as const };
  });
}

export async function setSponsorPlacementStatus(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(PlacementStatusInputSchema, input, async ({ placementId, status }) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const { error } = await admin.from("sponsor_placements").update({ status }).eq("id", placementId);
    if (error) throw new MpError("SPONSORS.PLACEMENT_STATUS_FAILED", error.message, 500);

    revalidatePath(ADMIN_SPONSORS_PATH);
    return { ok: true as const };
  });
}

export async function recordSponsorPlacementEvent(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(TrackEventSchema, input, async ({ placementId, eventType, sessionId, pathname, referrer, metadata }) => {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const admin = adminClient();

    const { data: active, error: activeError } = await admin
      .from("active_sponsor_placements")
      .select("placement_id")
      .eq("placement_id", placementId)
      .maybeSingle();
    if (activeError) throw new MpError("SPONSORS.TRACK_VALIDATE_FAILED", activeError.message, 500);
    if (!active) throw new MpError("SPONSORS.PLACEMENT_NOT_ACTIVE", "El placement no está activo.", 400);

    const { error } = await admin.from("sponsor_placement_events").insert({
      placement_id: placementId,
      event_type: eventType,
      user_id: user?.id ?? null,
      session_id: cleanNullable(sessionId),
      pathname: cleanNullable(pathname),
      referrer: cleanNullable(referrer),
      metadata: metadata ?? {},
    });
    if (error) throw new MpError("SPONSORS.TRACK_FAILED", error.message, 500);

    return { ok: true as const };
  });
}
