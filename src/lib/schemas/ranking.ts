// Ranking schemas: leaderboard rows, match results, snapshots.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, MpSportSchema, UuidSchema } from "./common";

extendZodWithOpenApi(z);

export const MatchStatusSchema = z
  .enum(["scheduled", "live", "reported", "confirmed", "disputed", "walkover", "cancelled"])
  .openapi("MatchStatus");

export const RankingEntrySchema = z
  .object({
    userId: UuidSchema,
    displayName: z.string(),
    avatarUrl: z.string().url().nullable(),
    city: z.string().nullable(),
    sport: MpSportSchema,
    rank: z.number().int(),
    currentRating: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    matchesTotal: z.number().int(),
  })
  .openapi("RankingEntry");

export const PlayerStatsSchema = z
  .object({
    userId: UuidSchema,
    sport: MpSportSchema,
    matchesTotal: z.number().int(),
    wins: z.number().int(),
    losses: z.number().int(),
    currentRating: z.number().int(),
    peakRating: z.number().int(),
    lastMatchAt: IsoDateTimeSchema.nullable(),
  })
  .openapi("PlayerStats");

export const RankingSnapshotSchema = z
  .object({
    rating: z.number().int(),
    rankPosition: z.number().int().nullable(),
    snapshotAt: IsoDateTimeSchema,
  })
  .openapi("RankingSnapshot");

export const MatchResultSchema = z
  .object({
    id: UuidSchema,
    sport: MpSportSchema,
    playedAt: IsoDateTimeSchema,
    clubId: UuidSchema.nullable(),
    reservationId: UuidSchema.nullable(),
    tournamentMatchId: UuidSchema.nullable(),
    sideA: z.array(z.record(z.string(), z.unknown())),
    sideB: z.array(z.record(z.string(), z.unknown())),
    winnerSide: z.enum(["a", "b", "d"]).nullable(),
    status: MatchStatusSchema,
    reportedBy: UuidSchema,
    confirmedBy: UuidSchema.nullable(),
    confirmedAt: IsoDateTimeSchema.nullable(),
    disputedReason: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("MatchResult");

export const RankingListParamsSchema = z
  .object({
    sport: MpSportSchema,
    country: z.string().optional(),
    city: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .openapi("RankingListParams");

export const MatchResultReportSchema = z
  .object({
    sport: MpSportSchema,
    playedAt: IsoDateTimeSchema,
    clubId: UuidSchema.optional(),
    reservationId: UuidSchema.optional(),
    sideA: z.array(z.object({ userId: UuidSchema, scoreSets: z.array(z.number().int()).optional() })).min(1).max(2),
    sideB: z.array(z.object({ userId: UuidSchema, scoreSets: z.array(z.number().int()).optional() })).min(1).max(2),
    winnerSide: z.enum(["a", "b", "d"]),
  })
  .openapi("MatchResultReport");

export type RankingEntry = z.infer<typeof RankingEntrySchema>;
export type RankingSnapshot = z.infer<typeof RankingSnapshotSchema>;
export type MatchResult = z.infer<typeof MatchResultSchema>;
