"use server";

// Server Actions for the "Solicitar Club" wizard. Mirrors the catalog in
// docs/architecture/40-api.md §3.2.
import "server-only";

import { z } from "zod";
import { headers } from "next/headers";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { withIdempotency } from "@/lib/api/idempotency";
import { assertRateLimit, RATE_LIMITS } from "@/lib/api/ratelimit";
import { AuthError } from "@/lib/auth/session";
import {
  ClubApplicationCourtCreateSchema,
  ClubApplicationCourtSchema,
  ClubApplicationCourtUpdateSchema,
  ClubApplicationDetailSchema,
  ClubApplicationSchema,
  ClubApplicationUpdateSchema,
  SubmitApplicationSchema,
  type ClubApplication,
  type ClubApplicationCourt,
  type ClubApplicationDetail,
} from "@/lib/schemas/clubApplications";
import { UuidSchema } from "@/lib/schemas/common";
import { notifyAdmins } from "@/server/notifications/dispatch";

// ── Mappers (snake_case row → camelCase domain) ─────────────────────────
function mapApplication(row: Record<string, unknown>): ClubApplication {
  return ClubApplicationSchema.parse({
    id: row.id,
    code: row.code,
    applicantId: row.applicant_id,
    status: row.status,
    currentStep: row.current_step,
    name: row.name ?? null,
    orgType: row.org_type ?? null,
    sports: row.sports ?? [],
    shortDescription: row.short_description ?? null,
    legalName: row.legal_name ?? null,
    taxId: row.tax_id ?? null,
    foundedYear: row.founded_year ?? null,
    contactPerson: row.contact_person ?? null,
    contactEmail: row.contact_email ?? null,
    contactPhone: row.contact_phone ?? null,
    websiteOrSocial: row.website_or_social ?? null,
    address: row.address ?? null,
    district: row.district ?? null,
    province: row.province ?? null,
    country: row.country ?? null,
    referenceNote: row.reference_note ?? null,
    parking: row.parking ?? null,
    geoLat: row.geo_lat !== null && row.geo_lat !== undefined ? Number(row.geo_lat) : null,
    geoLng: row.geo_lng !== null && row.geo_lng !== undefined ? Number(row.geo_lng) : null,
    locationVerifiedAt: row.location_verified_at ?? null,
    weeklyHours: (row.weekly_hours as Record<string, unknown>) ?? {},
    cancellationPolicy: row.cancellation_policy ?? "flexible_24h",
    termsAcceptedAt: row.terms_accepted_at ?? null,
    commissionPct: row.commission_pct !== null && row.commission_pct !== undefined ? Number(row.commission_pct) : 10,
    currency: row.currency ?? null,
    submittedAt: row.submitted_at ?? null,
    reviewerId: row.reviewer_id ?? null,
    reviewStartedAt: row.review_started_at ?? null,
    approvedAt: row.approved_at ?? null,
    rejectedAt: row.rejected_at ?? null,
    rejectionReason: row.rejection_reason ?? null,
    reviewerNotes: row.reviewer_notes ?? null,
    resultingClubId: row.resulting_club_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapCourt(row: Record<string, unknown>): ClubApplicationCourt {
  return ClubApplicationCourtSchema.parse({
    id: row.id,
    applicationId: row.application_id,
    ordinal: row.ordinal,
    proposedCode: row.proposed_code,
    sport: row.sport,
    surface: row.surface ?? null,
    indoor: row.indoor,
    lights: row.lights,
    openTime: row.open_time ?? null,
    closeTime: row.close_time ?? null,
    basePriceCents: row.base_price_cents ?? null,
    currency: row.currency ?? null,
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

// ── getMyApplication ────────────────────────────────────────────────────
export async function getMyApplication(): Promise<ActionResult<ClubApplication | null>> {
  return runAction(z.undefined(), undefined, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("club_applications")
      .select("*")
      .eq("applicant_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new MpError("CLUB_APP.DB_ERROR", error.message, 500);
    return data ? mapApplication(data) : null;
  });
}

// ── createApplication ───────────────────────────────────────────────────
export async function createApplication(): Promise<ActionResult<ClubApplication>> {
  return runAction(z.undefined(), undefined, async () => {
    const userId = await requireUserId();
    await assertRateLimit({ key: `clubApp:create:${userId}`, ...RATE_LIMITS.mutationsAuthn });

    const idemKey = (await headers()).get("idempotency-key") ?? undefined;

    return withIdempotency(
      { key: idemKey, scope: "createApplication", userId, input: null },
      async () => {
        const supabase = await getServerClient();

        const { data, error } = await supabase
          .from("club_applications")
          .insert({ applicant_id: userId } as never)
          .select()
          .single();

        if (error) {
          if (error.code === "23505") {
            throw new MpError(
              "CLUB_APP.ALREADY_OPEN",
              "You already have an open application",
              409,
            );
          }
          throw new MpError("CLUB_APP.CREATE_FAILED", error.message, 500);
        }

        await supabase
          .from("club_application_events")
          .insert({ application_id: data.id, kind: "created", actor_id: userId } as never);

        return mapApplication(data);
      },
    );
  });
}

// ── getApplicationDetail ────────────────────────────────────────────────
const GetDetailSchema = z.object({ applicationId: UuidSchema });

export async function getApplicationDetail(
  input: unknown,
): Promise<ActionResult<ClubApplicationDetail>> {
  return runAction(GetDetailSchema, input, async ({ applicationId }) => {
    const supabase = await getServerClient();

    const [appR, coR, doR, phR, evR] = await Promise.all([
      supabase.from("club_applications").select("*").eq("id", applicationId).single(),
      supabase
        .from("club_application_courts")
        .select("*")
        .eq("application_id", applicationId)
        .order("ordinal"),
      supabase
        .from("club_application_documents")
        .select("*")
        .eq("application_id", applicationId),
      supabase
        .from("club_application_photos")
        .select("*")
        .eq("application_id", applicationId)
        .order("ordinal"),
      supabase
        .from("club_application_events")
        .select("*")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false }),
    ]);

    if (appR.error || !appR.data) throw new MpError("CLUB_APP.NOT_FOUND", "Application not found", 404);

    const detail: ClubApplicationDetail = {
      application: mapApplication(appR.data),
      courts: (coR.data ?? []).map(mapCourt),
      documents: (doR.data ?? []).map((r) => ({
        id: r.id,
        applicationId: r.application_id,
        kind: r.kind,
        status: r.status,
        storagePath: r.storage_path ?? null,
        mimeType: r.mime_type ?? null,
        sizeBytes: r.size_bytes ?? null,
        filename: r.filename ?? null,
        uploadedAt: r.uploaded_at ?? null,
        reviewedBy: r.reviewed_by ?? null,
        reviewedAt: r.reviewed_at ?? null,
        rejectionReason: r.rejection_reason ?? null,
      })),
      photos: (phR.data ?? []).map((r) => ({
        id: r.id,
        applicationId: r.application_id,
        storagePath: r.storage_path,
        caption: r.caption ?? null,
        ordinal: r.ordinal,
        createdAt: r.created_at,
      })),
      events: (evR.data ?? []).map((r) => ({
        id: r.id,
        applicationId: r.application_id,
        kind: r.kind,
        actorId: r.actor_id ?? null,
        actorRole: r.actor_role ?? null,
        payload: (r.payload ?? {}) as Record<string, unknown>,
        note: r.note ?? null,
        createdAt: r.created_at,
      })),
    };

    return ClubApplicationDetailSchema.parse(detail);
  });
}

// ── updateApplication ───────────────────────────────────────────────────
const UpdateSchema = z.object({
  applicationId: UuidSchema,
  patch: ClubApplicationUpdateSchema,
});

export async function updateApplication(input: unknown): Promise<ActionResult<ClubApplication>> {
  return runAction(UpdateSchema, input, async ({ applicationId, patch }) => {
    const supabase = await getServerClient();

    const payload: Record<string, unknown> = {};
    if (patch.step === 1) {
      const d = patch.data;
      if (d.name !== undefined) payload.name = d.name;
      if (d.orgType !== undefined) payload.org_type = d.orgType;
      if (d.sports !== undefined) payload.sports = d.sports;
      if (d.shortDescription !== undefined) payload.short_description = d.shortDescription;
      if (d.legalName !== undefined) payload.legal_name = d.legalName;
      if (d.taxId !== undefined) payload.tax_id = d.taxId;
      if (d.foundedYear !== undefined) payload.founded_year = d.foundedYear;
      if (d.contactPerson !== undefined) payload.contact_person = d.contactPerson;
      if (d.contactEmail !== undefined) payload.contact_email = d.contactEmail;
      if (d.contactPhone !== undefined) payload.contact_phone = d.contactPhone;
      if (d.websiteOrSocial !== undefined) payload.website_or_social = d.websiteOrSocial;
      if (d.name && d.orgType && d.sports?.length) payload.current_step = 2;
    } else if (patch.step === 2) {
      const d = patch.data;
      if (d.address !== undefined) payload.address = d.address;
      if (d.district !== undefined) payload.district = d.district;
      if (d.province !== undefined) payload.province = d.province;
      if (d.country !== undefined) payload.country = d.country;
      if (d.referenceNote !== undefined) payload.reference_note = d.referenceNote;
      if (d.parking !== undefined) payload.parking = d.parking;
      if (d.geoLat !== undefined) payload.geo_lat = d.geoLat;
      if (d.geoLng !== undefined) payload.geo_lng = d.geoLng;
      if (d.address && d.district) payload.current_step = 3;
    } else if (patch.step === 3) {
      const d = patch.data;
      if (d.cancellationPolicy !== undefined) payload.cancellation_policy = d.cancellationPolicy;
      if (d.weeklyHours !== undefined) payload.weekly_hours = d.weeklyHours;
      if (d.currency !== undefined) payload.currency = d.currency;
    }

    const { data, error } = await supabase
      .from("club_applications")
      .update(payload as never)
      .eq("id", applicationId)
      .select()
      .single();

    if (error) throw new MpError("CLUB_APP.UPDATE_FAILED", error.message, 400);
    if (!data) throw new MpError("CLUB_APP.NOT_FOUND", "Application not found", 404);
    return mapApplication(data);
  });
}

// ── Courts ──────────────────────────────────────────────────────────────
const AddCourtSchema = z.object({
  applicationId: UuidSchema,
  data: ClubApplicationCourtCreateSchema,
});

export async function addApplicationCourt(
  input: unknown,
): Promise<ActionResult<ClubApplicationCourt>> {
  return runAction(AddCourtSchema, input, async ({ applicationId, data }) => {
    const supabase = await getServerClient();

    let ordinal = data.ordinal ?? 0;
    if (data.ordinal === undefined) {
      const { data: rows } = await supabase
        .from("club_application_courts")
        .select("ordinal")
        .eq("application_id", applicationId)
        .order("ordinal", { ascending: false })
        .limit(1);
      ordinal = rows && rows[0] ? rows[0].ordinal + 1 : 0;
    }

    const { data: row, error } = await supabase
      .from("club_application_courts")
      .insert({
        application_id: applicationId,
        ordinal,
        proposed_code: data.proposedCode,
        sport: data.sport,
        surface: data.surface ?? null,
        indoor: data.indoor ?? false,
        lights: data.lights ?? true,
        open_time: data.openTime ?? null,
        close_time: data.closeTime ?? null,
        base_price_cents: data.basePriceCents ?? null,
        currency: data.currency ?? null,
      })
      .select()
      .single();

    if (error) throw new MpError("CLUB_APP.COURT_CREATE_FAILED", error.message, 400);
    return mapCourt(row);
  });
}

const UpdateCourtSchema = z.object({
  applicationId: UuidSchema,
  courtId: UuidSchema,
  patch: ClubApplicationCourtUpdateSchema,
});

export async function updateApplicationCourt(
  input: unknown,
): Promise<ActionResult<ClubApplicationCourt>> {
  return runAction(UpdateCourtSchema, input, async ({ applicationId, courtId, patch }) => {
    const supabase = await getServerClient();
    const payload: Record<string, unknown> = {};
    if (patch.ordinal !== undefined) payload.ordinal = patch.ordinal;
    if (patch.proposedCode !== undefined) payload.proposed_code = patch.proposedCode;
    if (patch.sport !== undefined) payload.sport = patch.sport;
    if (patch.surface !== undefined) payload.surface = patch.surface;
    if (patch.indoor !== undefined) payload.indoor = patch.indoor;
    if (patch.lights !== undefined) payload.lights = patch.lights;
    if (patch.openTime !== undefined) payload.open_time = patch.openTime;
    if (patch.closeTime !== undefined) payload.close_time = patch.closeTime;
    if (patch.basePriceCents !== undefined) payload.base_price_cents = patch.basePriceCents;
    if (patch.currency !== undefined) payload.currency = patch.currency;

    const { data, error } = await supabase
      .from("club_application_courts")
      .update(payload as never)
      .eq("id", courtId)
      .eq("application_id", applicationId)
      .select()
      .single();
    if (error) throw new MpError("CLUB_APP.COURT_UPDATE_FAILED", error.message, 400);
    if (!data) throw new MpError("CLUB_APP.COURT_NOT_FOUND", "Court not found", 404);
    return mapCourt(data);
  });
}

const RemoveCourtSchema = z.object({
  applicationId: UuidSchema,
  courtId: UuidSchema,
});

export async function removeApplicationCourt(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(RemoveCourtSchema, input, async ({ applicationId, courtId }) => {
    const supabase = await getServerClient();
    const { error } = await supabase
      .from("club_application_courts")
      .delete()
      .eq("id", courtId)
      .eq("application_id", applicationId);
    if (error) throw new MpError("CLUB_APP.COURT_DELETE_FAILED", error.message, 400);
    return { ok: true as const };
  });
}

// ── submit / withdraw ───────────────────────────────────────────────────
const SubmitSchema = z.object({
  applicationId: UuidSchema,
  body: SubmitApplicationSchema,
});

export async function submitApplication(input: unknown): Promise<ActionResult<ClubApplication>> {
  return runAction(SubmitSchema, input, async ({ applicationId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: current, error: getErr } = await supabase
      .from("club_applications")
      .select("*")
      .eq("id", applicationId)
      .single();
    if (getErr || !current) throw new MpError("CLUB_APP.NOT_FOUND", "Application not found", 404);
    if (current.status !== "draft") {
      throw new MpError(
        "CLUB_APP.TRANSITION_FORBIDDEN",
        `Cannot submit from status '${current.status}'`,
        409,
      );
    }

    // Minimal completeness check; the full review pipeline is admin-side.
    const missing: string[] = [];
    if (!current.name) missing.push("name");
    if (!current.tax_id) missing.push("taxId");
    if (!current.contact_email) missing.push("contactEmail");
    if (!current.address) missing.push("address");

    if (missing.length > 0) {
      throw new MpError(
        "CLUB_APP.STEP_INVALID",
        "Application is missing required fields",
        422,
        { _: missing },
      );
    }

    const { data, error } = await supabase
      .from("club_applications")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), terms_accepted_at: new Date().toISOString() })
      .eq("id", applicationId)
      .select()
      .single();
    if (error) throw new MpError("CLUB_APP.SUBMIT_FAILED", error.message, 500);

    await supabase
      .from("club_application_events")
      .insert({ application_id: applicationId, kind: "submitted", actor_id: userId });

    await notifyAdmins({
      kind: "club_application_new",
      title: "Nueva solicitud de club",
      body: data.name ?? "Solicitud sin nombre",
      payload: { applicationId, applicantId: userId },
    });

    return mapApplication(data);
  });
}

const WithdrawSchema = z.object({
  applicationId: UuidSchema,
  reason: z.string().max(500).optional(),
});

export async function withdrawApplication(input: unknown): Promise<ActionResult<ClubApplication>> {
  return runAction(WithdrawSchema, input, async ({ applicationId, reason }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data, error } = await supabase
      .from("club_applications")
      .update({ status: "withdrawn" })
      .eq("id", applicationId)
      .in("status", ["draft", "submitted"])
      .select()
      .single();
    if (error || !data)
      throw new MpError(
        "CLUB_APP.TRANSITION_FORBIDDEN",
        "Application cannot be withdrawn in its current state",
        409,
      );

    await supabase.from("club_application_events").insert({
      application_id: applicationId,
      kind: "withdrawn",
      actor_id: userId,
      note: reason ?? null,
    });

    return mapApplication(data);
  });
}
