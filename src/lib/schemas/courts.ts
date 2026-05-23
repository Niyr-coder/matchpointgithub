// Court schemas: list per club, detail, owner CRUD.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, MpCurrencySchema, MpSportSchema, UuidSchema } from "./common";

extendZodWithOpenApi(z);

export const CourtSchema = z
  .object({
    id: UuidSchema,
    clubId: UuidSchema,
    code: z.string().max(20),
    name: z.string().nullable(),
    sport: MpSportSchema,
    surface: z.string().nullable(),
    indoor: z.boolean(),
    lights: z.boolean(),
    active: z.boolean(),
    ordinal: z.number().int(),
    // Mig 168: appearance + mantenimiento (opcionales en outputs).
    surfaceColor: z.string().optional(),
    linesColor: z.string().optional(),
    lineStyle: z.string().optional(),
    strokeWidth: z.number().optional(),
    maintenanceReason: z.string().nullable().optional(),
    maintenanceUntil: z.string().nullable().optional(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("Court");

export const CourtCreateSchema = z
  .object({
    clubId: UuidSchema,
    code: z.string().min(1).max(20),
    name: z.string().nullable().optional(),
    sport: MpSportSchema,
    surface: z.string().nullable().optional(),
    indoor: z.boolean().default(false),
    lights: z.boolean().default(true),
    ordinal: z.number().int().min(0).optional(),
  })
  .openapi("CourtCreate");

export const CourtUpdateSchema = z
  .object({
    code: z.string().min(1).max(20),
    name: z.string().nullable(),
    sport: MpSportSchema,
    surface: z.string().nullable(),
    indoor: z.boolean(),
    lights: z.boolean(),
    active: z.boolean(),
    ordinal: z.number().int().min(0),
    // Mig 168: apariencia del SVG del card en Owner · Canchas.
    surfaceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    linesColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    lineStyle: z.enum(["classic", "showcourt", "minimal"]),
    strokeWidth: z.number().int().min(1).max(6),
  })
  .partial()
  .openapi("CourtUpdate");

export const CourtMaintenanceSchema = z
  .object({
    courtId: UuidSchema,
    reason: z.string().min(2).max(280).optional(),
    until: z.string().datetime().nullable().optional(),
  })
  .openapi("CourtMaintenance");

export const BulkCourtMaintenanceSchema = z
  .object({
    courtIds: z.array(UuidSchema).min(1).max(50),
    reason: z.string().min(2).max(280).optional(),
    until: z.string().datetime().nullable().optional(),
  })
  .openapi("BulkCourtMaintenance");

// Bloqueo de un slot específico (reservation kind=event|class generada por staff).
export const CourtBlockerSchema = z
  .object({
    courtId: UuidSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    kind: z.enum(["event", "class"]).default("event"),
    notes: z.string().max(280).optional(),
  })
  .openapi("CourtBlocker");

// ── court_pricing ────────────────────────────────────────────────────────
// Pricing band para una cancha: rango horario (starts_at..ends_at) opcionalmente
// limitado a un día de la semana (day_of_week 0-6 = Dom-Sáb), con precio en
// cents + moneda + duración del slot. Múltiples bands por cancha permiten
// diurna/nocturna, weekend, etc. Para Ola A el AddCourt form crea 2 bands
// (diurna + nocturna) cubriendo el día entero (day_of_week = null = todos).
const TimeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Hora inválida (HH:MM)")
  .transform((s) => (s.length === 5 ? `${s}:00` : s));

export const CourtPricingBandSchema = z
  .object({
    id: UuidSchema.optional(),
    dayOfWeek: z.number().int().min(0).max(6).nullable(),
    startsAt: TimeStringSchema,
    endsAt: TimeStringSchema,
    priceCents: z.number().int().min(0),
    durationMinutes: z.number().int().min(15).max(240).default(60),
    currency: MpCurrencySchema,
    active: z.boolean().default(true),
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: "endsAt debe ser > startsAt",
    path: ["endsAt"],
  })
  .openapi("CourtPricingBand");

export const CourtPricingSchema = z
  .object({
    id: UuidSchema,
    courtId: UuidSchema,
    dayOfWeek: z.number().int().min(0).max(6).nullable(),
    startsAt: z.string(),
    endsAt: z.string(),
    priceCents: z.number().int().min(0),
    durationMinutes: z.number().int(),
    currency: MpCurrencySchema,
    active: z.boolean(),
  })
  .openapi("CourtPricing");

// setCourtPricing reemplaza TODAS las bands activas de la cancha por la lista
// dada (delete + insert dentro de la misma transacción lógica). Idempotente.
export const SetCourtPricingSchema = z
  .object({
    courtId: UuidSchema,
    bands: z.array(CourtPricingBandSchema).max(50),
  })
  .openapi("SetCourtPricing");

export type Court = z.infer<typeof CourtSchema>;
export type CourtCreate = z.infer<typeof CourtCreateSchema>;
export type CourtUpdate = z.infer<typeof CourtUpdateSchema>;
export type CourtPricing = z.infer<typeof CourtPricingSchema>;
export type CourtPricingBand = z.infer<typeof CourtPricingBandSchema>;
