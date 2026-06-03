import { z } from "zod";
import { UuidSchema } from "./common";

export const MechanicKindSchema = z.enum([
  "follow",
  "reserve",
  "play",
  "share",
  "invite",
  "buy",
  "pay",
]);

export const GiveawayMechanicConfigSchema = z.object({
  kind: MechanicKindSchema,
  enabled: z.boolean(),
  weight: z.coerce.number().int().min(1).max(20),
});

export const GiveawayOwnerTypeSchema = z.enum(["club", "partner", "matchpoint"]);

export const GiveawayStatusSchema = z.enum([
  "draft",
  "open",
  "closing",
  "closed",
  "drawn",
  "cancelled",
]);

export const ClubFeedPostKindSchema = z.enum([
  "giveaway",
  "event",
  "result",
  "photo",
  "notice",
  "spotlight",
  "announcement",
]);

export const SaveGiveawayPremioSchema = z.object({
  giveawayId: UuidSchema.optional(),
  clubId: UuidSchema,
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(200).optional(),
  prizeLabel: z.string().trim().min(1).max(200),
  category: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  prizeImageUrl: z.string().url().optional().nullable(),
  estimatedValueCents: z.coerce.number().int().min(0).optional().nullable(),
});

export const SaveGiveawayMechanicsSchema = z.object({
  giveawayId: UuidSchema,
  mechanics: z.array(GiveawayMechanicConfigSchema).min(1).max(7),
  maxEntriesPerUser: z.coerce.number().int().min(1).max(50).optional(),
});

export const SaveGiveawayRulesSchema = z.object({
  giveawayId: UuidSchema,
  eligibility: z.enum(["followers", "members", "all"]).default("followers"),
  opensAt: z.string().datetime().optional().nullable(),
  closesAt: z.string().datetime().optional().nullable(),
  drawAt: z.string().datetime().optional().nullable(),
  drawChannel: z.string().trim().max(200).optional().nullable(),
  rules: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  maxWinners: z.coerce.number().int().min(1).max(20).default(1),
});

export const PublishGiveawaySchema = z.object({ giveawayId: UuidSchema });

export const CreateClubFeedPostSchema = z.object({
  clubId: UuidSchema,
  kind: z.enum(["event", "photo", "notice", "spotlight", "announcement"]),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(4000).optional(),
  mediaUrl: z.string().url().optional().nullable(),
  refId: UuidSchema.optional().nullable(),
  ctaLabel: z.string().trim().max(80).optional(),
  ctaHref: z.string().trim().max(500).optional(),
});

export const EnterGiveawayPrereqSchema = z.object({
  giveawayId: UuidSchema,
  followClub: z.boolean().default(true),
  acceptRules: z.boolean(),
});

export const SubmitGiveawayShareSchema = z.object({
  giveawayId: UuidSchema,
  evidenceUrl: z.string().min(1).max(500),
});

export const ReviewGiveawayManualSchema = z.object({
  submissionId: UuidSchema,
  decision: z.enum(["approved", "rejected"]),
});

export const ClubFeedPostViewSchema = z.object({
  id: UuidSchema,
  clubId: UuidSchema,
  kind: ClubFeedPostKindSchema,
  refId: UuidSchema.nullable(),
  title: z.string(),
  body: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  badge: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
  publishedAt: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const GiveawayMechanicProgressSchema = z.object({
  kind: MechanicKindSchema,
  label: z.string(),
  weight: z.number().int(),
  done: z.boolean(),
  pending: z.boolean().optional(),
  autoVerify: z.boolean(),
});

export const GiveawayDetailViewSchema = z.object({
  id: UuidSchema,
  clubId: UuidSchema,
  clubName: z.string(),
  clubSlug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  prizeLabel: z.string(),
  prizeImageUrl: z.string().nullable(),
  description: z.string().nullable(),
  ownerType: GiveawayOwnerTypeSchema,
  status: GiveawayStatusSchema,
  eligibility: z.enum(["followers", "members", "all"]),
  maxWinners: z.number().int(),
  maxEntriesPerUser: z.number().int(),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  drawAt: z.string().nullable(),
  drawChannel: z.string().nullable(),
  rules: z.array(z.string()),
  mechanics: z.array(GiveawayMechanicProgressSchema),
  entryCount: z.number().int(),
  totalEntryWeight: z.number().int(),
  myEntries: z.number().int(),
  myProbabilityPct: z.number(),
  hasJoined: z.boolean(),
  won: z.boolean().nullable(),
  winners: z.array(
    z.object({
      userId: UuidSchema,
      displayName: z.string(),
      rank: z.number().int(),
    }),
  ),
});

export const MyGiveawayRowSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  clubName: z.string(),
  clubSlug: z.string(),
  ownerType: GiveawayOwnerTypeSchema,
  status: GiveawayStatusSchema,
  myEntries: z.number().int(),
  maxEntries: z.number().int(),
  closesAt: z.string().nullable(),
  drawAt: z.string().nullable(),
  prizeImageUrl: z.string().nullable(),
  won: z.boolean().nullable(),
});

export const MyGiveawayRequirementSchema = z.object({
  kind: z.string(),
  label: z.string(),
  met: z.boolean(),
  pending: z.boolean().optional(),
});

export const MyGiveawayAdentroSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  subtitle: z.string().nullable(),
  clubName: z.string(),
  clubSlug: z.string(),
  ownerType: GiveawayOwnerTypeSchema,
  prizeImageUrl: z.string().nullable(),
  prizeLabel: z.string(),
  qualifierCount: z.number().int(),
  probabilityPct: z.number(),
  closesAt: z.string().nullable(),
  drawAt: z.string().nullable(),
  drawChannel: z.string().nullable(),
  urgent: z.boolean(),
});

export const MyGiveawayPendingSchema = MyGiveawayAdentroSchema.extend({
  requirements: z.array(MyGiveawayRequirementSchema),
  metCount: z.number().int(),
  totalReq: z.number().int(),
});

export const MyGiveawayWonSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  subtitle: z.string().nullable(),
  clubName: z.string(),
  clubSlug: z.string(),
  ownerType: GiveawayOwnerTypeSchema,
  prizeImageUrl: z.string().nullable(),
  prizeLabel: z.string(),
  drawnAt: z.string().nullable(),
  claimStatus: z.enum(["pending", "claimed"]),
  claimHint: z.string().nullable(),
});

export const MyGiveawayLostSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  subtitle: z.string().nullable(),
  clubName: z.string(),
  clubSlug: z.string(),
  ownerType: GiveawayOwnerTypeSchema,
  prizeImageUrl: z.string().nullable(),
  qualifierCount: z.number().int(),
  drawnAt: z.string().nullable(),
});

export const MyGiveawayUnlockQualifySchema = z.object({
  sorteo: z.string(),
  giveawayId: UuidSchema,
  already: z.boolean(),
});

export const MyGiveawayUnlockActionSchema = z.object({
  kind: z.string(),
  label: z.string(),
  icon: z.string(),
  autoVerify: z.boolean(),
  qualifiesFor: z.array(MyGiveawayUnlockQualifySchema),
});

export const MyGiveawayNextDrawSchema = z.object({
  giveawayId: UuidSchema,
  title: z.string(),
  drawAt: z.string(),
  drawChannel: z.string().nullable(),
  probabilityPct: z.number(),
  urgent: z.boolean(),
});

export const MyGiveawaysDashboardSchema = z.object({
  displayName: z.string(),
  username: z.string().nullable(),
  adentro: z.array(MyGiveawayAdentroSchema),
  pendientes: z.array(MyGiveawayPendingSchema),
  ganados: z.array(MyGiveawayWonSchema),
  pasados: z.array(MyGiveawayLostSchema),
  unlockActions: z.array(MyGiveawayUnlockActionSchema),
  nextDraw: MyGiveawayNextDrawSchema.nullable(),
  stats: z.object({
    adentro: z.number().int(),
    pendientes: z.number().int(),
    ganados: z.number().int(),
    pasados: z.number().int(),
    winRatePct: z.number(),
  }),
});

export const GiveawayOrgParticipantSchema = z.object({
  userId: UuidSchema,
  displayName: z.string(),
  totalEntries: z.number().int(),
  breakdown: z.string(),
  followsClub: z.boolean(),
});

export const GiveawayOrgMechanicStatSchema = z.object({
  kind: z.string(),
  label: z.string(),
  weight: z.number().int(),
  completedCount: z.number().int(),
  participantCount: z.number().int(),
});

export const GiveawayManualSubmissionSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  displayName: z.string(),
  kind: z.string(),
  evidenceUrl: z.string(),
  createdAt: z.string(),
});

export const GiveawayOrgManageViewSchema = z.object({
  giveaway: GiveawayDetailViewSchema,
  clubName: z.string(),
  followerCount: z.number().int(),
  participantCount: z.number().int(),
  topParticipants: z.array(GiveawayOrgParticipantSchema),
  mechanicStats: z.array(GiveawayOrgMechanicStatSchema),
  pendingManualReviews: z.number().int(),
  pendingSubmissions: z.array(GiveawayManualSubmissionSchema),
});

export const GiveawayOrgWinnerDetailSchema = z.object({
  userId: UuidSchema,
  displayName: z.string(),
  initials: z.string(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  totalEntries: z.number().int(),
  followsClub: z.boolean(),
});

export const GiveawayOrgWinnerViewSchema = z.object({
  giveaway: GiveawayDetailViewSchema,
  clubName: z.string(),
  winner: GiveawayOrgWinnerDetailSchema,
  totalEntries: z.number().int(),
  participantCount: z.number().int(),
});

export type ClubFeedPostView = z.infer<typeof ClubFeedPostViewSchema>;
export type GiveawayDetailView = z.infer<typeof GiveawayDetailViewSchema>;
export type MyGiveawayRow = z.infer<typeof MyGiveawayRowSchema>;
export type MyGiveawayAdentro = z.infer<typeof MyGiveawayAdentroSchema>;
export type MyGiveawayPending = z.infer<typeof MyGiveawayPendingSchema>;
export type MyGiveawayWon = z.infer<typeof MyGiveawayWonSchema>;
export type MyGiveawayLost = z.infer<typeof MyGiveawayLostSchema>;
export type MyGiveawayUnlockAction = z.infer<typeof MyGiveawayUnlockActionSchema>;
export type MyGiveawaysDashboard = z.infer<typeof MyGiveawaysDashboardSchema>;
export type GiveawayOrgManageView = z.infer<typeof GiveawayOrgManageViewSchema>;
export type GiveawayOrgWinnerView = z.infer<typeof GiveawayOrgWinnerViewSchema>;
