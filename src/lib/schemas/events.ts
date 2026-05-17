// Club / partner events (clinics, mixers, social).
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  IsoDateTimeSchema,
  MpCurrencySchema,
  SlugSchema,
  UuidSchema,
} from "./common";

extendZodWithOpenApi(z);

export const EventKindSchema = z
  .enum(["social", "clinic", "exhibition", "party", "league_meet", "other"])
  .openapi("EventKind");

export const EventStatusSchema = z
  .enum(["draft", "published", "registration_open", "registration_closed", "live", "finished", "cancelled"])
  .openapi("EventListStatus");

export const EventVisibilitySchema = z
  .enum(["public", "members", "private"])
  .openapi("EventVisibility");

export const EventPaymentPolicySchema = z
  .enum(["free", "prepay", "onsite", "flexible"])
  .openapi("EventPaymentPolicy");

export const EventSchema = z
  .object({
    id: UuidSchema,
    clubId: UuidSchema.nullable(),
    partnerId: UuidSchema.nullable(),
    organizerId: UuidSchema,
    name: z.string(),
    slug: SlugSchema,
    description: z.string().nullable(),
    coverUrl: z.string().url().nullable(),
    kind: EventKindSchema,
    status: EventStatusSchema,
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
    capacity: z.number().int().nullable(),
    priceCents: z.number().int(),
    currency: MpCurrencySchema.nullable(),
    paymentPolicy: EventPaymentPolicySchema,
    visibility: EventVisibilitySchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("Event");

export const EventRegistrationSchema = z
  .object({
    id: UuidSchema,
    eventId: UuidSchema,
    userId: UuidSchema,
    status: z.enum(["registered", "cancelled", "attended", "no_show", "pending_payment"]),
    paidTransactionId: UuidSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("EventRegistration");

export const EventListParamsSchema = z
  .object({
    clubId: UuidSchema.optional(),
    kind: EventKindSchema.optional(),
    fromDate: IsoDateTimeSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(60).default(20),
  })
  .openapi("EventListParams");

export const EventCreateSchema = z
  .object({
    clubId: UuidSchema.optional(),
    partnerId: UuidSchema.optional(),
    name: z.string().min(2).max(120),
    slug: SlugSchema,
    description: z.string().max(2000).optional(),
    coverUrl: z.string().url().optional(),
    kind: EventKindSchema,
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
    capacity: z.number().int().positive().optional(),
    priceCents: z.number().int().min(0).default(0),
    currency: MpCurrencySchema.optional(),
    visibility: EventVisibilitySchema.default("public"),
  })
  .openapi("EventCreate");

export type EventRow = z.infer<typeof EventSchema>;
export type EventRegistration = z.infer<typeof EventRegistrationSchema>;
