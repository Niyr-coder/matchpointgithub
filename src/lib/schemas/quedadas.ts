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

// ── Datos de organización estructurados (banco + premios) ────────────────────
export const QuedadaAccountTypeSchema = z.enum(["ahorros", "corriente"]).openapi("QuedadaAccountType");

// Datos bancarios del organizador (para que los inscritos transfieran).
export const PaymentAccountSchema = z
  .object({
    bank: z.string().trim().min(1).max(60),
    accountType: QuedadaAccountTypeSchema,
    accountNumber: z.string().trim().min(3).max(40),
    holderName: z.string().trim().min(1).max(80),
    holderId: z.string().trim().max(20).optional(), // cédula/RUC
    note: z.string().trim().max(140).optional(), // ej. teléfono DeUna
  })
  .openapi("QuedadaPaymentAccount");

// Un premio por puesto. `prize` es texto ($20, media docena, etc); `valueCents`
// es opcional (referencia de valor, no se cobra).
export const PrizeSchema = z
  .object({
    place: z.string().trim().min(1).max(40),
    prize: z.string().trim().min(1).max(120),
    valueCents: z.coerce.number().int().min(0).max(10_000_000).optional(),
  })
  .openapi("QuedadaPrize");

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
    // Bancarios + premios estructurados (reemplazan paymentInfo/prizesText texto).
    paymentAccount: PaymentAccountSchema.optional(),
    prizes: z.array(PrizeSchema).max(10).optional(),
    // Deprecados (texto libre, mig 133). Se mantienen opcionales por compat.
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

// Transiciones de estado intermedias (creador). finished = vía resultados;
// cancelled = vía cancelQuedada.
export const SetQuedadaStatusSchema = z
  .object({
    quedadaId: UuidSchema,
    status: z.enum(["registration_open", "registration_closed", "live"]),
  })
  .openapi("SetQuedadaStatus");

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

// Auto-asignación "popcorn": mezcla los inscritos disponibles y llena los cupos
// vacíos de la categoría (2 por cupo en dobles, 1 en singles).
export const AutoAssignCategorySchema = z
  .object({ quedadaId: UuidSchema, categoryId: UuidSchema })
  .openapi("AutoAssignQuedadaCategory");

export const SetParticipantPaidSchema = z
  .object({ quedadaId: UuidSchema, userId: UuidSchema, paid: z.boolean() })
  .openapi("SetQuedadaParticipantPaid");

export const QuedadaLogisticsSchema = z
  .object({
    quedadaId: UuidSchema,
    courtsCount: z.coerce.number().int().min(1).max(64).nullable().optional(),
    hours: z.coerce.number().min(0.5).max(24).nullable().optional(),
    courtPriceCents: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
    paymentAccount: PaymentAccountSchema.nullable().optional(),
    prizes: z.array(PrizeSchema).max(10).nullable().optional(),
    // Deprecados (texto libre, mig 133).
    paymentInfo: z.string().trim().max(500).nullable().optional(),
    prizesText: z.string().trim().max(500).nullable().optional(),
  })
  .openapi("QuedadaLogistics");

export const JoinByCodeSchema = z.object({ code: z.string().trim().min(4).max(40) }).openapi("JoinQuedadaByCode");

// ── Plantillas (hasta 5/usuario) ─────────────────────────────────────────────
// config = snapshot del wizard (QuedadaInitial, sin fecha). Permisivo a propósito:
// es data privada del propio usuario que vuelve a su wizard.
export const ListQuedadaTemplatesSchema = z.object({}).openapi("ListQuedadaTemplates");
export const SaveQuedadaTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    config: z.record(z.string(), z.unknown()),
  })
  .openapi("SaveQuedadaTemplate");
export const QuedadaTemplateIdSchema = z.object({ templateId: UuidSchema }).openapi("QuedadaTemplateId");

export type CreateQuedada = z.infer<typeof CreateQuedadaSchema>;
export type Quedada = z.infer<typeof QuedadaSchema>;
export type QuedadaFormat = z.infer<typeof QuedadaFormatSchema>;
export type PaymentAccount = z.infer<typeof PaymentAccountSchema>;
export type Prize = z.infer<typeof PrizeSchema>;
