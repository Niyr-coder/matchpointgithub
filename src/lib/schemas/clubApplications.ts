// Club applications: wizard state, per-step partial schemas, and review pipeline.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  IsoDateTimeSchema,
  MpCurrencySchema,
  MpSportSchema,
  UuidSchema,
} from "./common";

extendZodWithOpenApi(z);

export const ClubAppStatusSchema = z
  .enum([
    "draft",
    "submitted",
    "docs_review",
    "field_verification",
    "final_review",
    "approved",
    "rejected",
    "withdrawn",
  ])
  .openapi("ClubApplicationStatus");

export const ClubOrgTypeSchema = z
  .enum(["private", "public", "concession"])
  .openapi("ClubOrgType");

export const ParkingTypeSchema = z
  .enum(["unknown", "street", "private", "valet"])
  .openapi("ParkingType");

export const CancellationPolicySchema = z
  .enum(["flexible_24h", "moderate_48h", "strict_7d"])
  .openapi("CancellationPolicy");

export const ClubDocKindSchema = z
  .enum([
    "tax_id_certificate",
    "incorporation_act",
    "land_use_permit",
    "liability_insurance",
    "health_permit",
    "other",
  ])
  .openapi("ClubDocKind");

export const ClubDocStatusSchema = z
  .enum(["pending", "uploaded", "approved", "rejected"])
  .openapi("ClubDocStatus");

export const ClubAppEventKindSchema = z
  .enum([
    "created",
    "step_completed",
    "submitted",
    "docs_review_started",
    "docs_approved",
    "docs_rejected",
    "field_scheduled",
    "field_completed",
    "final_review_started",
    "approved",
    "rejected",
    "withdrawn",
    "note_added",
    "contacted",
  ])
  .openapi("ClubAppEventKind");

// ── Courts ──────────────────────────────────────────────────────────────
export const ClubApplicationCourtSchema = z
  .object({
    id: UuidSchema,
    applicationId: UuidSchema,
    ordinal: z.number().int().min(0),
    proposedCode: z.string().min(1).max(20),
    sport: MpSportSchema,
    surface: z.string().nullable(),
    indoor: z.boolean(),
    lights: z.boolean(),
    openTime: z.string().nullable(),
    closeTime: z.string().nullable(),
    basePriceCents: z.number().int().nullable(),
    currency: MpCurrencySchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("ClubApplicationCourt");

export const ClubApplicationCourtCreateSchema = ClubApplicationCourtSchema.pick({
  proposedCode: true,
  sport: true,
  surface: true,
  indoor: true,
  lights: true,
  openTime: true,
  closeTime: true,
  basePriceCents: true,
  currency: true,
})
  .extend({
    ordinal: z.number().int().min(0).optional(),
  })
  .partial({
    surface: true,
    indoor: true,
    lights: true,
    openTime: true,
    closeTime: true,
    basePriceCents: true,
    currency: true,
  })
  .openapi("ClubApplicationCourtCreate");

export const ClubApplicationCourtUpdateSchema = ClubApplicationCourtCreateSchema.partial().openapi(
  "ClubApplicationCourtUpdate",
);

// ── Documents ───────────────────────────────────────────────────────────
export const ClubApplicationDocumentSchema = z
  .object({
    id: UuidSchema,
    applicationId: UuidSchema,
    kind: ClubDocKindSchema,
    status: ClubDocStatusSchema,
    storagePath: z.string().nullable(),
    mimeType: z.string().nullable(),
    sizeBytes: z.number().int().nullable(),
    filename: z.string().nullable(),
    uploadedAt: IsoDateTimeSchema.nullable(),
    reviewedBy: UuidSchema.nullable(),
    reviewedAt: IsoDateTimeSchema.nullable(),
    rejectionReason: z.string().nullable(),
  })
  .openapi("ClubApplicationDocument");

// ── Photos ──────────────────────────────────────────────────────────────
export const ClubApplicationPhotoSchema = z
  .object({
    id: UuidSchema,
    applicationId: UuidSchema,
    storagePath: z.string(),
    caption: z.string().nullable(),
    ordinal: z.number().int().min(0).max(5),
    createdAt: IsoDateTimeSchema,
    // Signed URL del bucket privado club-covers, TTL ~1h. Solo se genera
    // cuando el caller la necesita (uploads y reads del detail).
    previewUrl: z.string().nullable().optional(),
  })
  .openapi("ClubApplicationPhoto");

// ── Events / timeline ───────────────────────────────────────────────────
export const ClubApplicationEventSchema = z
  .object({
    id: UuidSchema,
    applicationId: UuidSchema,
    kind: ClubAppEventKindSchema,
    actorId: UuidSchema.nullable(),
    actorRole: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
    note: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("ClubApplicationEvent");

// ── Main application ────────────────────────────────────────────────────
export const ClubApplicationSchema = z
  .object({
    id: UuidSchema,
    code: z.string().regex(/^SC-\d{4,}$/),
    applicantId: UuidSchema,
    status: ClubAppStatusSchema,
    currentStep: z.number().int().min(1).max(5),

    // Step 1
    name: z.string().nullable(),
    orgType: ClubOrgTypeSchema.nullable(),
    sports: z.array(MpSportSchema),
    shortDescription: z.string().max(160).nullable(),
    legalName: z.string().nullable(),
    taxId: z.string().nullable(),
    foundedYear: z.number().int().nullable(),
    contactPerson: z.string().nullable(),
    contactEmail: z.string().email().nullable(),
    contactPhone: z.string().nullable(),
    websiteOrSocial: z.string().nullable(),

    // Step 2
    address: z.string().nullable(),
    district: z.string().nullable(),
    province: z.string().nullable(),
    country: z.string().nullable(),
    referenceNote: z.string().nullable(),
    parking: ParkingTypeSchema.nullable(),
    geoLat: z.number().nullable(),
    geoLng: z.number().nullable(),
    locationVerifiedAt: IsoDateTimeSchema.nullable(),

    // Step 3
    weeklyHours: z.record(z.string(), z.unknown()),
    cancellationPolicy: CancellationPolicySchema,

    // Step 5
    termsAcceptedAt: IsoDateTimeSchema.nullable(),
    commissionPct: z.number(),
    currency: MpCurrencySchema.nullable(),

    // Review pipeline
    submittedAt: IsoDateTimeSchema.nullable(),
    reviewerId: UuidSchema.nullable(),
    reviewStartedAt: IsoDateTimeSchema.nullable(),
    approvedAt: IsoDateTimeSchema.nullable(),
    rejectedAt: IsoDateTimeSchema.nullable(),
    rejectionReason: z.string().nullable(),
    reviewerNotes: z.string().nullable(),
    resultingClubId: UuidSchema.nullable(),

    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("ClubApplication");

// ── Step-specific partial inputs (used by PATCH /club-applications/:id) ─
export const Step1Schema = z
  .object({
    name: z.string().min(2).max(120),
    orgType: ClubOrgTypeSchema,
    sports: z.array(MpSportSchema).min(1),
    shortDescription: z.string().max(160),
    legalName: z.string().min(2),
    taxId: z.string().min(3),
    foundedYear: z.number().int().min(1900).max(2100),
    contactPerson: z.string().min(2),
    contactEmail: z.string().email(),
    contactPhone: z.string().min(7),
    websiteOrSocial: z.string(),
  })
  .partial()
  .openapi("ClubApplicationStep1");

export const Step2Schema = z
  .object({
    address: z.string().min(3),
    district: z.string().min(2),
    province: z.string(),
    country: z.string(),
    referenceNote: z.string(),
    parking: ParkingTypeSchema,
    geoLat: z.number().min(-90).max(90),
    geoLng: z.number().min(-180).max(180),
  })
  .partial()
  .openapi("ClubApplicationStep2");

export const Step3MetaSchema = z
  .object({
    cancellationPolicy: CancellationPolicySchema,
    weeklyHours: z.record(z.string(), z.unknown()),
    currency: MpCurrencySchema,
  })
  .partial()
  .openapi("ClubApplicationStep3Meta");

// Discriminated update payload — caller declares which step they're saving.
export const ClubApplicationUpdateSchema = z
  .discriminatedUnion("step", [
    z.object({ step: z.literal(1), data: Step1Schema }),
    z.object({ step: z.literal(2), data: Step2Schema }),
    z.object({ step: z.literal(3), data: Step3MetaSchema }),
  ])
  .openapi("ClubApplicationUpdate");

export const SubmitApplicationSchema = z
  .object({
    termsAccepted: z.literal(true),
  })
  .openapi("SubmitApplication");

// ── Detail bundle (returned by GET /:id) ────────────────────────────────
export const ClubApplicationDetailSchema = z
  .object({
    application: ClubApplicationSchema,
    courts: z.array(ClubApplicationCourtSchema),
    documents: z.array(ClubApplicationDocumentSchema),
    photos: z.array(ClubApplicationPhotoSchema),
    events: z.array(ClubApplicationEventSchema),
  })
  .openapi("ClubApplicationDetail");

export type ClubApplication = z.infer<typeof ClubApplicationSchema>;
export type ClubApplicationCourt = z.infer<typeof ClubApplicationCourtSchema>;
export type ClubApplicationDocument = z.infer<typeof ClubApplicationDocumentSchema>;
export type ClubApplicationPhoto = z.infer<typeof ClubApplicationPhotoSchema>;
export type ClubApplicationEvent = z.infer<typeof ClubApplicationEventSchema>;
export type ClubApplicationDetail = z.infer<typeof ClubApplicationDetailSchema>;
export type ClubApplicationUpdate = z.infer<typeof ClubApplicationUpdateSchema>;
export type ClubApplicationCourtCreate = z.infer<typeof ClubApplicationCourtCreateSchema>;
export type ClubApplicationCourtUpdate = z.infer<typeof ClubApplicationCourtUpdateSchema>;
