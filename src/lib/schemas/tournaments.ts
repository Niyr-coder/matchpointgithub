// Tournaments + leagues + brackets.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  IsoDateTimeSchema,
  MpCurrencySchema,
  MpSkillLevelSchema,
  MpSportSchema,
  SlugSchema,
  StoredSlugSchema,
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

export const GroupSchedulingConfigSchema = z
  .object({
    courtIds: z.array(UuidSchema).min(1).max(32),
    slotDurationMin: z.number().int().min(15).max(240).default(50),
    roundOneStartsAt: IsoDateTimeSchema.nullable().optional(),
    fechaGapHours: z.number().int().min(1).max(168).optional(),
  })
  .openapi("GroupSchedulingConfig");

export const GroupWildcardConfigSchema = z
  .object({
    mode: z.literal("best_thirds_global"),
    count: z.number().int().min(0).max(16),
  })
  .openapi("GroupWildcardConfig");

export const KnockoutExtrasConfigSchema = z
  .object({
    thirdPlaceMatch: z.boolean(),
  })
  .openapi("KnockoutExtrasConfig");

export const GroupPlayoffConfigSchema = z
  .object({
    groupsCount: z.number().int().min(1).max(16),
    advancePerGroup: z.number().int().min(1).max(16),
    finalScoringOverride: ScoringConfigSchema.nullable().optional(),
    scheduling: GroupSchedulingConfigSchema.nullable().optional(),
    wildcards: GroupWildcardConfigSchema.nullable().optional(),
    knockoutExtras: KnockoutExtrasConfigSchema.nullable().optional(),
  })
  .openapi("GroupPlayoffConfig");

/** Default al crear torneo grupos + playoffs sin UI de config (club wizard). */
export const DEFAULT_GROUP_PLAYOFF_CONFIG = {
  groupsCount: 2,
  advancePerGroup: 4,
  finalScoringOverride: null,
} satisfies z.infer<typeof GroupPlayoffConfigSchema>;

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
    modality: TournamentModalitySchema.nullable().optional(),
    scoringConfig: ScoringConfigSchema.nullable().optional(),
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
    mprMin: z.number().nullable().optional(),
    mprMax: z.number().nullable().optional(),
    stage: z
      .enum(["pending_groups", "group_stage", "group_complete", "knockout", "complete"])
      .nullable()
      .optional(),
    groupPlayoffConfig: GroupPlayoffConfigSchema.nullable().optional(),
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

// Categoría que el organizador puede definir desde el wizard de creación.
// Espejo de CategoryBodySchema (server action) pero sin `level` (el wizard
// usa solo el rango MPR). Se inserta en tournament_categories al crear.
export const TournamentCreateCategorySchema = z
  .object({
    name: z.string().min(1).max(80),
    gender: z.enum(["m", "f", "mixed", "open"]).nullable().optional(),
    modality: TournamentModalitySchema.optional(),
    mprMin: z.number().min(2.0).max(8.0).nullable().optional(),
    mprMax: z.number().min(2.0).max(8.0).nullable().optional(),
    ageMin: z.number().int().min(0).max(120).nullable().optional(),
    ageMax: z.number().int().min(0).max(120).nullable().optional(),
    maxTeams: z.number().int().positive().nullable().optional(),
  })
  .openapi("TournamentCreateCategory");

export const TournamentCreateSchema = z
  .object({
    partnerId: UuidSchema,
    leagueId: UuidSchema.optional(),
    clubId: UuidSchema.optional(),
    name: z.string().min(2).max(120),
    slug: SlugSchema,
    description: z.string().max(2000).optional(),
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
    groupPlayoffConfig: GroupPlayoffConfigSchema.optional(),
    categories: z.array(TournamentCreateCategorySchema).max(20).optional(),
    termsAccepted: z.literal(true, {
      message: "Debes aceptar los términos del torneo",
    }),
  })
  .superRefine((data, ctx) => {
    if (data.format === "groups_to_knockout" && !data.groupPlayoffConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Configura grupos y clasificados para Grupos + eliminación",
        path: ["groupPlayoffConfig"],
      });
    }
    if (data.registrationOpensAt && data.registrationClosesAt) {
      if (new Date(data.registrationOpensAt) >= new Date(data.registrationClosesAt)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La apertura de inscripciones debe ser anterior al cierre",
          path: ["registrationClosesAt"],
        });
      }
    }
  })
  .openapi("TournamentCreate");

export const ClubTournamentPrizeDraftSchema = z
  .object({
    position: z.number().int().min(0),
    placeLabel: z.string().min(1).max(40),
    prizeLabel: z.string().max(200),
    valueCents: z.number().int().min(0).optional(),
  })
  .openapi("ClubTournamentPrizeDraft");

/** Creación de torneo desde el club (owner/manager) sin partner_org. */
export const ClubTournamentCreateSchema = z
  .object({
    clubId: UuidSchema,
    name: z.string().min(2).max(120),
    slug: SlugSchema,
    description: z.string().max(2000).optional(),
    sport: MpSportSchema.default("pickleball"),
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
    prizes: z.array(ClubTournamentPrizeDraftSchema).max(20).optional(),
    modality: TournamentModalitySchema.default("doubles"),
    scoringConfig: ScoringConfigSchema.default({
      type: "side_out",
      points: 11,
      winBy: 2,
      bestOf: 3,
    }),
    groupPlayoffConfig: GroupPlayoffConfigSchema.optional(),
    categories: z.array(TournamentCreateCategorySchema).min(1).max(20),
    publish: z.boolean().optional(),
  })
  .openapi("ClubTournamentCreate");

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
    slug: StoredSlugSchema,
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
    // true si el equipo MATCHPOINT marcó el torneo como "Estelar" — se usa
    // para ubicarlo en el banner grande de portada. Los demás van al grid.
    isFeatured: z.boolean().default(false),
  })
  .openapi("TournamentFeatured");

export type League = z.infer<typeof LeagueSchema>;
export type Tournament = z.infer<typeof TournamentSchema>;
export type TournamentCreateCategory = z.infer<typeof TournamentCreateCategorySchema>;
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;
export type TournamentDetail = z.infer<typeof TournamentDetailSchema>;
export type Bracket = z.infer<typeof BracketSchema>;
export type Registration = z.infer<typeof RegistrationSchema>;
export type TournamentFeatured = z.infer<typeof TournamentFeaturedSchema>;
