// Tournaments + leagues + brackets.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  IsoDateTimeSchema,
  MpCurrencySchema,
  MpSkillLevelSchema,
  MpSportSchema,
  SlugSchema,
  UuidSchema,
} from "./common";

extendZodWithOpenApi(z);

export const TournamentFormatSchema = z
  .enum(["single_elim", "double_elim", "round_robin", "swiss", "groups_to_knockout"])
  .openapi("TournamentFormat");

export const TournamentPaymentPolicySchema = z
  .enum(["free", "prepay", "onsite", "flexible"])
  .openapi("TournamentPaymentPolicy");

export const TournamentModalitySchema = z
  .enum(["singles", "doubles", "mixed_doubles"])
  .openapi("TournamentModality");

export const ScoringConfigSchema = z
  .object({
    type: z.enum(["side_out", "rally"]),
    points: z.number().int().min(7).max(31),
    winBy: z.number().int().min(1).max(5),
    bestOf: z.number().int().refine((n) => n === 1 || n === 3 || n === 5, {
      message: "bestOf debe ser 1, 3 o 5",
    }),
  })
  .openapi("ScoringConfig");

export const EventStatusSchema = z
  .enum(["draft", "published", "registration_open", "registration_closed", "live", "finished", "cancelled"])
  .openapi("EventStatus");

export const LeagueSchema = z
  .object({
    id: UuidSchema,
    partnerId: UuidSchema.nullable(),
    name: z.string(),
    slug: SlugSchema,
    sport: MpSportSchema,
    description: z.string().nullable(),
    coverUrl: z.string().url().nullable(),
    season: z.string().nullable(),
    status: z.enum(["draft", "active", "finished", "archived"]),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("League");

export const TournamentSchema = z
  .object({
    id: UuidSchema,
    leagueId: UuidSchema.nullable(),
    partnerId: UuidSchema.nullable(),
    clubId: UuidSchema.nullable(),
    name: z.string(),
    slug: SlugSchema,
    description: z.string().nullable(),
    coverUrl: z.string().url().nullable(),
    sport: MpSportSchema,
    format: TournamentFormatSchema,
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema.nullable(),
    registrationOpensAt: IsoDateTimeSchema.nullable(),
    registrationClosesAt: IsoDateTimeSchema.nullable(),
    status: EventStatusSchema,
    maxParticipants: z.number().int().nullable(),
    entryFeeCents: z.number().int(),
    currency: MpCurrencySchema.nullable(),
    paymentPolicy: TournamentPaymentPolicySchema,
    prizePoolCents: z.number().int().nullable(),
    rulesUrl: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("Tournament");

export const TournamentCategorySchema = z
  .object({
    id: UuidSchema,
    name: z.string(),
    gender: z.enum(["m", "f", "mixed", "open"]).nullable(),
    level: MpSkillLevelSchema.nullable(),
    ageMin: z.number().int().nullable(),
    ageMax: z.number().int().nullable(),
    maxTeams: z.number().int().nullable(),
  })
  .openapi("TournamentCategory");

export const RegistrationSchema = z
  .object({
    id: UuidSchema,
    tournamentId: UuidSchema,
    categoryId: UuidSchema.nullable(),
    teamId: UuidSchema.nullable(),
    playerIds: z.array(UuidSchema),
    registeredBy: UuidSchema,
    status: z.enum(["pending", "accepted", "rejected", "withdrawn", "waitlist"]),
    paidTransactionId: UuidSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("TournamentRegistration");

export const TournamentDetailSchema = z
  .object({
    tournament: TournamentSchema,
    categories: z.array(TournamentCategorySchema),
    registrationCount: z.number().int(),
  })
  .openapi("TournamentDetail");

export const BracketMatchSchema = z
  .object({
    id: UuidSchema,
    bracketId: UuidSchema,
    round: z.number().int(),
    position: z.number().int(),
    sideARegistrationId: UuidSchema.nullable(),
    sideBRegistrationId: UuidSchema.nullable(),
    scheduledAt: IsoDateTimeSchema.nullable(),
    courtId: UuidSchema.nullable(),
    status: z.enum(["scheduled", "live", "reported", "confirmed", "disputed", "walkover", "cancelled"]),
    winnerSide: z.enum(["a", "b", "d"]).nullable(),
    score: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi("BracketMatch");

export const BracketSchema = z
  .object({
    id: UuidSchema,
    tournamentId: UuidSchema,
    categoryId: UuidSchema.nullable(),
    format: TournamentFormatSchema,
    size: z.number().int(),
    matches: z.array(BracketMatchSchema),
  })
  .openapi("Bracket");

export const LeagueCreateSchema = z
  .object({
    partnerId: UuidSchema,
    name: z.string().min(2).max(120),
    slug: SlugSchema,
    sport: MpSportSchema,
    description: z.string().max(2000).optional(),
    season: z.string().max(80).optional(),
  })
  .openapi("LeagueCreate");

export const TournamentCreateSchema = z
  .object({
    partnerId: UuidSchema,
    leagueId: UuidSchema.optional(),
    clubId: UuidSchema.optional(),
    name: z.string().min(2).max(120),
    slug: SlugSchema,
    sport: MpSportSchema,
    format: TournamentFormatSchema,
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema.nullable().optional(),
    registrationOpensAt: IsoDateTimeSchema.optional(),
    registrationClosesAt: IsoDateTimeSchema.optional(),
    maxParticipants: z.number().int().positive().optional(),
    entryFeeCents: z.number().int().min(0).default(0),
    currency: MpCurrencySchema.optional(),
    paymentPolicy: TournamentPaymentPolicySchema.optional(),
    prizePoolCents: z.number().int().min(0).optional(),
    modality: TournamentModalitySchema.default("doubles"),
    scoringConfig: ScoringConfigSchema.default({
      type: "side_out",
      points: 11,
      winBy: 2,
      bestOf: 3,
    }),
    termsAccepted: z.literal(true, {
      message: "Debes aceptar los términos del torneo",
    }),
  })
  .openapi("TournamentCreate");

export const TournamentRegisterSchema = z
  .object({
    categoryId: UuidSchema.optional(),
    teamId: UuidSchema.optional(),
    playerIds: z.array(UuidSchema).min(1).max(4),
  })
  .openapi("TournamentRegister");

export const TournamentListParamsSchema = z
  .object({
    leagueId: UuidSchema.optional(),
    partnerId: UuidSchema.optional(),
    sport: MpSportSchema.optional(),
    fromDate: IsoDateTimeSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(60).default(20),
  })
  .openapi("TournamentListParams");

export const TournamentFeaturedSchema = z
  .object({
    id: UuidSchema,
    slug: SlugSchema,
    name: z.string(),
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema.nullable(),
    prizePoolCents: z.number().int().nullable(),
    entryFeeCents: z.number().int(),
    currency: MpCurrencySchema.nullable(),
    maxParticipants: z.number().int().nullable(),
    sport: MpSportSchema,
    format: TournamentFormatSchema,
    status: z.string(),
    clubName: z.string().nullable(),
    clubCity: z.string().nullable(),
    registrationsCount: z.number().int(),
    // true si el equipo MatchPoint marcó el torneo como "Estelar" — se usa
    // para ubicarlo en el banner grande de portada. Los demás van al grid.
    isFeatured: z.boolean().default(false),
  })
  .openapi("TournamentFeatured");

export type League = z.infer<typeof LeagueSchema>;
export type Tournament = z.infer<typeof TournamentSchema>;
export type TournamentDetail = z.infer<typeof TournamentDetailSchema>;
export type Bracket = z.infer<typeof BracketSchema>;
export type Registration = z.infer<typeof RegistrationSchema>;
export type TournamentFeatured = z.infer<typeof TournamentFeaturedSchema>;
