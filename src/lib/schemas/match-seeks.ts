// "Busco partido" (match seeks / LFG) schemas.
// Un jugador publica un aviso buscando rival; otros se postulan; el autor
// acepta uno → se crea un match. Ver docs/product/03-match-seeks.md.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, MpMatchModeSchema, MpSportSchema, UuidSchema } from "./common";

extendZodWithOpenApi(z);

export const MatchSeekStatusSchema = z
  .enum(["open", "matched", "expired", "cancelled"])
  .openapi("MatchSeekStatus");

export const MatchSeekApplicationStatusSchema = z
  .enum(["pending", "accepted", "rejected", "withdrawn"])
  .openapi("MatchSeekApplicationStatus");

// Nivel en escala display (ej. 3.8). 1.0–7.0 cubre el rango real de niveles.
const SkillLevelSchema = z.coerce.number().min(1).max(7);

// ── Output ────────────────────────────────────────────────────────────────
export const MatchSeekSchema = z
  .object({
    id: UuidSchema,
    createdBy: UuidSchema,
    sport: MpSportSchema,
    mode: MpMatchModeSchema,
    partnerId: UuidSchema.nullable(),
    city: z.string().nullable(),
    clubId: UuidSchema.nullable(),
    skillMin: z.number().nullable(),
    skillMax: z.number().nullable(),
    ranked: z.boolean(),
    windowStart: IsoDateTimeSchema,
    windowEnd: IsoDateTimeSchema.nullable(),
    notes: z.string().nullable(),
    status: MatchSeekStatusSchema,
    matchId: UuidSchema.nullable(),
    expiresAt: IsoDateTimeSchema,
    createdAt: IsoDateTimeSchema,
    // Derivados para el feed/UI.
    authorName: z.string().nullable(),
    applicantsCount: z.number().int(),
    // Estado de MI postulación a este aviso (null = no me postulé).
    myApplicationStatus: MatchSeekApplicationStatusSchema.nullable().optional(),
  })
  .openapi("MatchSeek");

export const MatchSeekApplicationSchema = z
  .object({
    id: UuidSchema,
    seekId: UuidSchema,
    applicantId: UuidSchema,
    partnerId: UuidSchema.nullable(),
    status: MatchSeekApplicationStatusSchema,
    message: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
    respondedAt: IsoDateTimeSchema.nullable(),
    // Derivado.
    applicantName: z.string().nullable(),
  })
  .openapi("MatchSeekApplication");

// ── Input: crear aviso ──────────────────────────────────────────────────
export const CreateMatchSeekSchema = z
  .object({
    sport: MpSportSchema,
    mode: MpMatchModeSchema,
    // Obligatorio en doubles (el partner del autor).
    partnerId: UuidSchema.nullable().optional(),
    clubId: UuidSchema.nullable().optional(),
    skillMin: SkillLevelSchema.nullable().optional(),
    skillMax: SkillLevelSchema.nullable().optional(),
    ranked: z.boolean().default(true),
    windowStart: IsoDateTimeSchema,
    windowEnd: IsoDateTimeSchema.nullable().optional(),
    notes: z.string().max(280).nullable().optional(),
  })
  .refine((d) => d.mode !== "doubles" || !!d.partnerId, {
    message: "En dobles debes elegir tu partner",
    path: ["partnerId"],
  })
  .refine((d) => d.mode !== "singles" || !d.partnerId, {
    message: "En singles no se elige partner",
    path: ["partnerId"],
  })
  .refine(
    (d) => d.skillMin == null || d.skillMax == null || d.skillMin <= d.skillMax,
    { message: "El nivel mínimo no puede ser mayor que el máximo", path: ["skillMax"] },
  )
  .refine(
    (d) => d.windowEnd == null || new Date(d.windowEnd) >= new Date(d.windowStart),
    { message: "La franja debe terminar después de empezar", path: ["windowEnd"] },
  )
  .openapi("CreateMatchSeek");

// ── Input: postularse ───────────────────────────────────────────────────
export const ApplyToMatchSeekSchema = z
  .object({
    seekId: UuidSchema,
    // Obligatorio si el seek es doubles (la dupla del postulante).
    partnerId: UuidSchema.nullable().optional(),
    message: z.string().max(280).nullable().optional(),
  })
  .openapi("ApplyToMatchSeek");

export const AcceptApplicantSchema = z
  .object({
    seekId: UuidSchema,
    applicationId: UuidSchema,
    // Fecha/hora pactada del partido (dentro de la ventana del aviso).
    playedAt: IsoDateTimeSchema.optional(),
  })
  .openapi("AcceptApplicant");

export const CancelMatchSeekSchema = z.object({ seekId: UuidSchema }).openapi("CancelMatchSeek");

export const WithdrawApplicationSchema = z
  .object({ applicationId: UuidSchema })
  .openapi("WithdrawApplication");

export const ListMatchSeeksParamsSchema = z
  .object({
    sport: MpSportSchema.optional(),
    mode: MpMatchModeSchema.optional(),
    // Por defecto el feed filtra por la ciudad del usuario; este flag lo abre.
    allCities: z.coerce.boolean().default(false),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .openapi("ListMatchSeeksParams");

export type MatchSeek = z.infer<typeof MatchSeekSchema>;
export type MatchSeekApplication = z.infer<typeof MatchSeekApplicationSchema>;
export type CreateMatchSeekInput = z.infer<typeof CreateMatchSeekSchema>;
