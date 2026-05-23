// Reservation + walkin schemas.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, MpSportSchema, UuidSchema } from "./common";

extendZodWithOpenApi(z);

export const ReservationStatusSchema = z
  .enum(["booked", "confirmed", "checked_in", "no_show", "cancelled", "completed"])
  .openapi("ReservationStatus");

export const ReservationVisibilitySchema = z
  .enum(["public", "members", "private"])
  .openapi("ReservationVisibility");

export const ReservationSourceSchema = z
  .enum(["app", "walkin", "admin", "recurring"])
  .openapi("ReservationSource");

export const ReservationParticipantSchema = z
  .object({
    userId: UuidSchema,
    status: z.enum(["pending", "accepted", "declined", "removed"]),
    invitedBy: UuidSchema.nullable(),
    joinedAt: IsoDateTimeSchema.nullable(),
  })
  .openapi("ReservationParticipant");

export const ReservationSchema = z
  .object({
    id: UuidSchema,
    clubId: UuidSchema,
    courtId: UuidSchema,
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
    status: ReservationStatusSchema,
    sport: MpSportSchema,
    visibility: ReservationVisibilitySchema,
    maxPlayers: z.number().int().min(2).max(8),
    notes: z.string().nullable(),
    organizerId: UuidSchema,
    source: ReservationSourceSchema,
    cancellationReason: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
    cancelledAt: IsoDateTimeSchema.nullable(),
    version: z.number().int(),
  })
  .openapi("Reservation");

export const ReservationDetailSchema = z
  .object({
    reservation: ReservationSchema,
    participants: z.array(ReservationParticipantSchema),
  })
  .openapi("ReservationDetail");

export const ReservationListParamsSchema = z
  .object({
    clubId: UuidSchema.optional(),
    organizerId: UuidSchema.optional(),
    courtId: UuidSchema.optional(),
    from: IsoDateTimeSchema.optional(),
    to: IsoDateTimeSchema.optional(),
    status: ReservationStatusSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .openapi("ReservationListParams");

export const ReservationCreateSchema = z
  .object({
    clubId: UuidSchema,
    courtId: UuidSchema,
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
    sport: MpSportSchema,
    visibility: ReservationVisibilitySchema.default("private"),
    maxPlayers: z.number().int().min(2).max(8).default(4),
    notes: z.string().max(500).nullable().optional(),
    // Mig 170: vincula la reserva a un cliente real de MATCHPOINT
    // (opcional — null = walk-in / sin cuenta, cliente identificado por notes).
    forUserId: UuidSchema.optional(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  })
  .openapi("ReservationCreate");

export const ReservationCancelSchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .openapi("ReservationCancel");

export const WalkinCreateSchema = z
  .object({
    clubId: UuidSchema,
    courtId: UuidSchema.optional(),
    customerName: z.string().min(2).max(120),
    customerPhone: z.string().max(40).optional(),
    partySize: z.number().int().min(1).max(8).default(2),
    durationMinutes: z.number().int().min(15).max(240).default(60),
    sport: MpSportSchema,
    startsAt: IsoDateTimeSchema.optional(),
  })
  .openapi("WalkinCreate");

export type Reservation = z.infer<typeof ReservationSchema>;
export type ReservationDetail = z.infer<typeof ReservationDetailSchema>;
export type ReservationCreate = z.infer<typeof ReservationCreateSchema>;
export type WalkinCreate = z.infer<typeof WalkinCreateSchema>;
