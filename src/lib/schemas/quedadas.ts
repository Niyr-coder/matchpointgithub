// Quedadas (juego social) schemas. Ver docs/product/0X-quedadas.md.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { UuidSchema, MpMatchModeSchema } from "./common";

extendZodWithOpenApi(z);

export const QuedadaFormatSchema = z
  .enum(["americano", "mexicano", "round_robin", "kotc", "canguil", "libre"])
  .openapi("QuedadaFormat");

export const QuedadaVisibilitySchema = z.enum(["open", "private"]).openapi("QuedadaVisibility");

export const QuedadaStatusSchema = z
  .enum(["draft", "published", "registration_open", "registration_closed", "live", "finished", "cancelled"])
  .openapi("QuedadaStatus");

// ── Crear ────────────────────────────────────────────────────────────────────
export const CreateQuedadaSchema = z
  .object({
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(500).optional(),
    format: QuedadaFormatSchema,
    matchMode: MpMatchModeSchema.default("doubles"),
    visibility: QuedadaVisibilitySchema.default("open"),
    startsAt: z.string().datetime({ offset: true }),
    locationText: z.string().trim().max(140).optional(),
    clubId: UuidSchema.optional(),
    maxPlayers: z.coerce.number().int().min(2).max(64).optional(),
    feeCents: z.coerce.number().int().min(0).max(1_000_000).default(0),
    perks: z.string().trim().max(280).optional(),
  })
  .openapi("CreateQuedada");

// ── Acciones sobre una quedada ───────────────────────────────────────────────
export const QuedadaIdSchema = z.object({ quedadaId: UuidSchema }).openapi("QuedadaId");

export const InviteToQuedadaSchema = z
  .object({ quedadaId: UuidSchema, userIds: z.array(UuidSchema).min(1).max(50) })
  .openapi("InviteToQuedada");

export const SetQuedadaResultsSchema = z
  .object({
    quedadaId: UuidSchema,
    results: z
      .array(
        z.object({
          userId: UuidSchema,
          points: z.coerce.number().int().min(0).max(10_000).nullable().optional(),
          finalRank: z.coerce.number().int().min(1).max(64).nullable().optional(),
        }),
      )
      .max(64),
  })
  .openapi("SetQuedadaResults");

export const ReportQuedadaSchema = z
  .object({ quedadaId: UuidSchema, reason: z.string().trim().min(3).max(280) })
  .openapi("ReportQuedada");

// ── Output ───────────────────────────────────────────────────────────────────
export const QuedadaSchema = z
  .object({
    id: UuidSchema,
    creatorId: UuidSchema,
    clubId: UuidSchema.nullable(),
    title: z.string(),
    description: z.string().nullable(),
    format: QuedadaFormatSchema,
    matchMode: MpMatchModeSchema,
    visibility: QuedadaVisibilitySchema,
    status: QuedadaStatusSchema,
    startsAt: z.string(),
    locationText: z.string().nullable(),
    maxPlayers: z.number().nullable(),
    feeCents: z.number(),
    perks: z.string().nullable(),
    ranked: z.boolean(),
    participantCount: z.number(),
  })
  .openapi("Quedada");

export type CreateQuedada = z.infer<typeof CreateQuedadaSchema>;
export type Quedada = z.infer<typeof QuedadaSchema>;
export type QuedadaFormat = z.infer<typeof QuedadaFormatSchema>;
