// Coach profile schemas. The profile row is keyed by profile.id so a single
// API returns both base identity (display_name from profiles) and coach-specific
// data joined-in by the server action.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  IsoDateTimeSchema,
  MpCurrencySchema,
  MpSportSchema,
  UuidSchema,
} from "./common";

extendZodWithOpenApi(z);

export const CoachProfileSchema = z
  .object({
    id: UuidSchema,
    displayName: z.string(),
    avatarUrl: z.string().url().nullable(),
    city: z.string().nullable(),
    headline: z.string().nullable(),
    bio: z.string().nullable(),
    yearsExperience: z.number().int().nullable(),
    hourlyRateCents: z.number().int().nullable(),
    currency: MpCurrencySchema.nullable(),
    introVideoUrl: z.string().url().nullable(),
    verifiedAt: IsoDateTimeSchema.nullable(),
    ratingAvg: z.number().nullable(),
    ratingCount: z.number().int(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("CoachProfile");

export const CoachSpecialtySchema = z
  .object({
    sport: MpSportSchema,
    specialty: z.string(),
    proficiency: z.number().int().min(1).max(5),
  })
  .openapi("CoachSpecialty");

export const CoachAvailabilitySchema = z
  .object({
    id: UuidSchema,
    clubId: UuidSchema.nullable(),
    dayOfWeek: z.number().int().min(0).max(6),
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .openapi("CoachAvailability");

export const CoachCertificationSchema = z
  .object({
    id: UuidSchema,
    name: z.string(),
    issuer: z.string().nullable(),
    issuedYear: z.number().int().nullable(),
    documentUrl: z.string().nullable(),
    verifiedAt: IsoDateTimeSchema.nullable(),
  })
  .openapi("CoachCertification");

export const CoachReviewSchema = z
  .object({
    id: UuidSchema,
    reviewerId: UuidSchema,
    rating: z.number().int().min(1).max(5),
    comment: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("CoachReview");

export const CoachDetailSchema = z
  .object({
    coach: CoachProfileSchema,
    specialties: z.array(CoachSpecialtySchema),
    availability: z.array(CoachAvailabilitySchema),
    certifications: z.array(CoachCertificationSchema),
    reviews: z.array(CoachReviewSchema),
    clubIds: z.array(UuidSchema),
  })
  .openapi("CoachDetail");

export const CoachListParamsSchema = z
  .object({
    clubId: UuidSchema.optional(),
    sport: MpSportSchema.optional(),
    specialty: z.string().optional(),
    q: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(24),
  })
  .openapi("CoachListParams");

export type CoachProfile = z.infer<typeof CoachProfileSchema>;
export type CoachDetail = z.infer<typeof CoachDetailSchema>;
