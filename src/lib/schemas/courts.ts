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
  })
  .partial()
  .openapi("CourtUpdate");

export type Court = z.infer<typeof CourtSchema>;
export type CourtCreate = z.infer<typeof CourtCreateSchema>;
export type CourtUpdate = z.infer<typeof CourtUpdateSchema>;
