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

// Una "regla clave" del modal de detalles. warn=true → advertencia (⚠);
// warn=false → informativa (✓).
export const QuedadaRuleSchema = z
  .object({
    text: z.string().trim().min(1).max(120),
    warn: z.boolean().default(false),
  })
  .openapi("QuedadaRule");

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
    // Largo del partido a X puntos (motor de juego). Fallback por categoría → quedada → 24.
    targetPoints: z.coerce.number().int().min(1).max(999).optional(),
    // Bancarios + premios estructurados (reemplazan paymentInfo/prizesText texto).
    paymentAccount: PaymentAccountSchema.optional(),
    prizes: z.array(PrizeSchema).max(10).optional(),
    rules: z.array(QuedadaRuleSchema).max(12).optional(),
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
          targetPoints: z.coerce.number().int().min(1).max(999).optional(),
        }),
      )
      .max(20)
      .optional(),
  })
  .openapi("CreateQuedada");

// ── Acciones sobre una quedada ───────────────────────────────────────────────
export const QuedadaIdSchema = z.object({ quedadaId: UuidSchema }).openapi("QuedadaId");

// Inscribirse: opcionalmente a una categoría (si la quedada tiene). El pago es
// offline (transferencia / en sitio) → no crea transacción.
export const JoinQuedadaSchema = z
  .object({ quedadaId: UuidSchema, categoryId: UuidSchema.nullable().optional() })
  .openapi("JoinQuedada");

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
    targetPoints: z.coerce.number().int().min(1).max(999).optional(),
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
    targetPoints: z.coerce.number().int().min(1).max(999).nullable().optional(),
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

// Check-in de asistencia (informativo). El organizador/co-host marca quién llegó.
export const SetParticipantCheckedInSchema = z
  .object({ quedadaId: UuidSchema, userId: UuidSchema, checkedIn: z.boolean() })
  .openapi("SetQuedadaParticipantCheckedIn");

// Marca/desmarca el check-in de TODOS los inscritos joined.
export const SetAllCheckedInSchema = z
  .object({ quedadaId: UuidSchema, checkedIn: z.boolean() })
  .openapi("SetAllQuedadaCheckedIn");

// Aviso de pago a los pendientes. Sin userIds → a todos los pendientes; con
// userIds → solo a esos (subset de pendientes). Cooldown de 30min por persona.
export const RemindQuedadaPaymentSchema = z
  .object({ quedadaId: UuidSchema, userIds: z.array(UuidSchema).max(64).optional() })
  .openapi("RemindQuedadaPayment");

// Ficha de un jugador en MIS quedadas (historial relacional organizador↔jugador).
export const QuedadaPlayerHistorySchema = z
  .object({ playerUserId: UuidSchema })
  .openapi("QuedadaPlayerHistory");

// Resumen financiero agregado del organizador (todas sus quedadas).
export const MyQuedadasFinanceStatsSchema = z.object({}).openapi("MyQuedadasFinanceStats");

export const QuedadaEngineModeSchema = z.enum(["rounds", "rolling"]).openapi("QuedadaEngineMode");

// Edición de datos generales tras crear (creador). Formato y modo (singles/dobles)
// NO se editan: cambiarlos rompe games/standings existentes.
export const UpdateQuedadaDetailsSchema = z
  .object({
    quedadaId: UuidSchema,
    title: z.string().trim().min(3).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    locationText: z.string().trim().max(140).nullable().optional(),
    visibility: QuedadaVisibilitySchema.optional(),
    maxPlayers: z.coerce.number().int().min(2).max(64).nullable().optional(),
    perks: z.string().trim().max(280).nullable().optional(),
  })
  .openapi("UpdateQuedadaDetails");

export const QuedadaLogisticsSchema = z
  .object({
    quedadaId: UuidSchema,
    courtsCount: z.coerce.number().int().min(1).max(64).nullable().optional(),
    hours: z.coerce.number().min(0.5).max(24).nullable().optional(),
    courtPriceCents: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
    targetPoints: z.coerce.number().int().min(1).max(999).nullable().optional(),
    engineMode: QuedadaEngineModeSchema.optional(),
    paymentAccount: PaymentAccountSchema.nullable().optional(),
    prizes: z.array(PrizeSchema).max(10).nullable().optional(),
    rules: z.array(QuedadaRuleSchema).max(12).nullable().optional(),
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

// ── Motor de juego (rediseño): rondas player-céntricas + puntos ──────────────
// Americano: genera la siguiente ronda emparejando inscritos (rota compañero/
// rival, byes rotativos). El nº de ronda lo calcula la action (siguiente libre).
export const GenerateQuedadaRoundSchema = z
  .object({ quedadaId: UuidSchema, categoryId: UuidSchema })
  .openapi("GenerateQuedadaRound");
export const GenerateAmericanoRoundSchema = GenerateQuedadaRoundSchema;
export const CreateManualQuedadaGameSchema = z
  .object({
    quedadaId: UuidSchema,
    categoryId: UuidSchema,
    sideA: z.array(UuidSchema).min(1).max(2),
    sideB: z.array(UuidSchema).min(1).max(2),
    courtNo: z.coerce.number().int().min(1).max(64).nullable().optional(),
  })
  .openapi("CreateManualQuedadaGame");
// Reporta el marcador de un game (organizador, directo, sin doble confirmación).
export const ReportGameSchema = z
  .object({
    gameId: UuidSchema,
    pointsA: z.coerce.number().int().min(0).max(999),
    pointsB: z.coerce.number().int().min(0).max(999),
  })
  .openapi("ReportQuedadaGame");
export const GameIdSchema = z.object({ gameId: UuidSchema }).openapi("QuedadaGameId");
// Borra una ronda completa (con sus games). Para regenerar un emparejamiento.
export const RoundIdSchema = z.object({ roundId: UuidSchema }).openapi("QuedadaRoundId");
// Cierra la quedada: calcula el podio individual (ranking por puntos a favor) y
// la pasa a 'finished'.
export const FinishQuedadaSchema = z.object({ quedadaId: UuidSchema }).openapi("FinishQuedada");

export type CreateQuedada = z.infer<typeof CreateQuedadaSchema>;
export type Quedada = z.infer<typeof QuedadaSchema>;
export type QuedadaFormat = z.infer<typeof QuedadaFormatSchema>;
export type PaymentAccount = z.infer<typeof PaymentAccountSchema>;
export type Prize = z.infer<typeof PrizeSchema>;
export type QuedadaRule = z.infer<typeof QuedadaRuleSchema>;
