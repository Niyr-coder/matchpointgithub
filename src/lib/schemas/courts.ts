// Court schemas: list per club, detail, owner CRUD.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, MpSportSchema, UuidSchema } from "./common";

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

export type Court = z.infer<typeof CourtSchema>;
export type CourtCreate = z.infer<typeof CourtCreateSchema>;
export type CourtUpdate = z.infer<typeof CourtUpdateSchema>;
