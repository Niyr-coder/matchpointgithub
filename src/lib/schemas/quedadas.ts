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
    // Logística + bancarios + premios (capturados al crear; editables luego en gestión).
    courtsCount: z.coerce.number().int().min(1).max(64).optional(),
    hours: z.coerce.number().min(0.5).max(24).optional(),
    courtPriceCents: z.coerce.number().int().min(0).max(1_000_000).optional(),
    paymentInfo: z.string().trim().max(500).optional(),
    prizesText: z.string().trim().max(500).optional(),
    // Categorías iniciales (los slots/parejas se llenan después en gestión).
    categories: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          levelLabel: z.string().trim().max(40).optional(),
          startsAt: z.string().datetime({ offset: true }).optional(),
          courtLabel: z.string().trim().max(40).optional(),
          maxSlots: z.coerce.number().int().min(1).max(64).optional(),
        }),
      )
      .max(20)
      .optional(),
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

// ── v1.x panel de gestión ────────────────────────────────────────────────────
export const CohostSchema = z.object({ quedadaId: UuidSchema, userId: UuidSchema }).openapi("QuedadaCohost");

export const CreateCategorySchema = z
  .object({
    quedadaId: UuidSchema,
    name: z.string().trim().min(1).max(60),
    levelLabel: z.string().trim().max(40).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    courtLabel: z.string().trim().max(40).optional(),
    maxSlots: z.coerce.number().int().min(1).max(64).optional(),
  })
  .openapi("CreateQuedadaCategory");

export const UpdateCategorySchema = z
  .object({
    categoryId: UuidSchema,
    name: z.string().trim().min(1).max(60).optional(),
    levelLabel: z.string().trim().max(40).nullable().optional(),
    startsAt: z.string().datetime({ offset: true }).nullable().optional(),
    courtLabel: z.string().trim().max(40).nullable().optional(),
    maxSlots: z.coerce.number().int().min(1).max(64).nullable().optional(),
  })
  .openapi("UpdateQuedadaCategory");

export const CategoryIdSchema = z.object({ categoryId: UuidSchema }).openapi("QuedadaCategoryId");

export const AssignPairSchema = z
  .object({
    quedadaId: UuidSchema,
    categoryId: UuidSchema,
    slotNo: z.coerce.number().int().min(1).max(200),
    playerAId: UuidSchema,
    playerBId: UuidSchema.nullable().optional(),
  })
  .openapi("AssignQuedadaPair");

export const RemovePairSchema = z.object({ pairId: UuidSchema }).openapi("RemoveQuedadaPair");

export const SetParticipantPaidSchema = z
  .object({ quedadaId: UuidSchema, userId: UuidSchema, paid: z.boolean() })
  .openapi("SetQuedadaParticipantPaid");

export const QuedadaLogisticsSchema = z
  .object({
    quedadaId: UuidSchema,
    courtsCount: z.coerce.number().int().min(1).max(64).nullable().optional(),
    hours: z.coerce.number().min(0.5).max(24).nullable().optional(),
    courtPriceCents: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
    paymentInfo: z.string().trim().max(500).nullable().optional(),
    prizesText: z.string().trim().max(500).nullable().optional(),
  })
  .openapi("QuedadaLogistics");

export const JoinByCodeSchema = z.object({ code: z.string().trim().min(4).max(40) }).openapi("JoinQuedadaByCode");

export type CreateQuedada = z.infer<typeof CreateQuedadaSchema>;
export type Quedada = z.infer<typeof QuedadaSchema>;
export type QuedadaFormat = z.infer<typeof QuedadaFormatSchema>;
