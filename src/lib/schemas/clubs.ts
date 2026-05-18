// Club schemas: public list, public detail, owner update.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  IsoDateTimeSchema,
  MpCurrencySchema,
  MpSportSchema,
  SlugSchema,
  UuidSchema,
} from "./common";

extendZodWithOpenApi(z);

export const ClubStatusSchema = z
  .enum(["pending", "active", "suspended", "archived"])
  .openapi("ClubStatus");

export const ClubSchema = z
  .object({
    id: UuidSchema,
    slug: SlugSchema,
    name: z.string(),
    description: z.string().nullable(),
    logoUrl: z.string().url().nullable(),
    coverUrl: z.string().url().nullable(),
    country: z.string(),
    city: z.string(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().email().nullable(),
    timezone: z.string(),
    currency: MpCurrencySchema,
    sports: z.array(MpSportSchema),
    status: ClubStatusSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    version: z.number().int(),
  })
  .openapi("Club");

export const ClubSettingsSchema = z
  .object({
    reservationWindowDays: z.number().int(),
    cancellationWindowHours: z.number().int(),
    defaultSlotMinutes: z.number().int(),
    allowWalkins: z.boolean(),
    chargeNoShowPct: z.number().int(),
    openHours: z.record(z.string(), z.unknown()),
  })
  .openapi("ClubSettings");

export const ClubPhotoSchema = z
  .object({
    id: UuidSchema,
    url: z.string(),
    caption: z.string().nullable(),
    ordinal: z.number().int(),
  })
  .openapi("ClubPhoto");

export const ClubDetailSchema = z
  .object({
    club: ClubSchema,
    settings: ClubSettingsSchema.nullable(),
    amenities: z.array(z.string()),
    photos: z.array(ClubPhotoSchema),
  })
  .openapi("ClubDetail");

export const ClubListParamsSchema = z
  .object({
    q: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    sport: MpSportSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .openapi("ClubListParams");

export const ClubUpdateSchema = z
  .object({
    name: z.string().min(2).max(120),
    description: z.string().nullable(),
    logoUrl: z.string().url().nullable(),
    coverUrl: z.string().url().nullable(),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().email().nullable(),
    sports: z.array(MpSportSchema).min(1),
    expectedVersion: z.number().int(),
  })
  .partial({
    name: true,
    description: true,
    logoUrl: true,
    coverUrl: true,
    address: true,
    phone: true,
    email: true,
    sports: true,
  })
  .openapi("ClubUpdate");

export const ClubFeaturedSchema = z
  .object({
    id: UuidSchema,
    slug: SlugSchema,
    name: z.string(),
    city: z.string(),
    coverUrl: z.string().url().nullable(),
    sports: z.array(MpSportSchema),
    currency: MpCurrencySchema,
    courtsCount: z.number().int(),
    minPriceCents: z.number().int().nullable(),
    // Snippet + dirección para mostrar en la card pública (el detalle entero
    // ahora vive detrás del gate de auth en /clubes/[slug]). Description la
    // truncamos en el view a ~120 chars.
    description: z.string().nullable(),
    address: z.string().nullable(),
    // null = club no pagó featuring; ISO string si está activo (futuro).
    // En lectura: si <= now(), tratar como null (expirado).
    featuredUntil: z.string().datetime({ offset: true }).nullable(),
  })
  .openapi("ClubFeatured");

// ── reviews ─────────────────────────────────────────────────────────────
export const ClubReviewSchema = z
  .object({
    id: UuidSchema,
    clubId: UuidSchema,
    userId: UuidSchema,
    userDisplayName: z.string(),
    userAvatarUrl: z.string().url().nullable(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("ClubReview");

export const ClubReviewCreateSchema = z
  .object({
    clubId: UuidSchema,
    rating: z.number().int().min(1).max(5),
    comment: z.string().min(4).max(2000).optional(),
  })
  .openapi("ClubReviewCreate");

export const ClubReviewStatsSchema = z
  .object({
    avgRating: z.number(),
    reviewsCount: z.number().int(),
  })
  .openapi("ClubReviewStats");

export type Club = z.infer<typeof ClubSchema>;
export type ClubDetail = z.infer<typeof ClubDetailSchema>;
export type ClubUpdate = z.infer<typeof ClubUpdateSchema>;
export type ClubListParams = z.infer<typeof ClubListParamsSchema>;
export type ClubFeatured = z.infer<typeof ClubFeaturedSchema>;
export type ClubReview = z.infer<typeof ClubReviewSchema>;
export type ClubReviewStats = z.infer<typeof ClubReviewStatsSchema>;
