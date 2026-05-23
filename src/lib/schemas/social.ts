// Friends + teams + invites schemas.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, MpSportSchema, SlugSchema, UuidSchema } from "./common";

extendZodWithOpenApi(z);

// ── friends ─────────────────────────────────────────────────────────────
export const FriendSchema = z
  .object({
    userId: UuidSchema,
    displayName: z.string(),
    avatarUrl: z.string().url().nullable(),
    city: z.string().nullable(),
    since: IsoDateTimeSchema,
  })
  .openapi("Friend");

export const FriendRequestSchema = z
  .object({
    id: UuidSchema,
    fromUserId: UuidSchema,
    toUserId: UuidSchema,
    status: z.enum(["pending", "accepted", "rejected", "cancelled"]),
    createdAt: IsoDateTimeSchema,
    respondedAt: IsoDateTimeSchema.nullable(),
  })
  .openapi("FriendRequest");

export const SendFriendRequestSchema = z
  .object({
    toUserId: UuidSchema,
  })
  .openapi("SendFriendRequest");

// ── teams ───────────────────────────────────────────────────────────────
export const TeamMemberRoleSchema = z
  .enum(["captain", "player", "substitute"])
  .openapi("TeamMemberRole");

export const TeamSchema = z
  .object({
    id: UuidSchema,
    name: z.string(),
    slug: SlugSchema,
    description: z.string().nullable(),
    sport: MpSportSchema.nullable(),
    logoUrl: z.string().url().nullable(),
    captainId: UuidSchema,
    clubId: UuidSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("Team");

export const TeamMemberSchema = z
  .object({
    userId: UuidSchema,
    displayName: z.string(),
    avatarUrl: z.string().url().nullable(),
    role: TeamMemberRoleSchema,
    joinedAt: IsoDateTimeSchema,
  })
  .openapi("TeamMember");

export const TeamInviteSchema = z
  .object({
    id: UuidSchema,
    teamId: UuidSchema,
    invitedUserId: UuidSchema,
    invitedBy: UuidSchema,
    status: z.enum(["pending", "accepted", "rejected", "cancelled"]),
    createdAt: IsoDateTimeSchema,
    respondedAt: IsoDateTimeSchema.nullable(),
  })
  .openapi("TeamInvite");

export const TeamDetailSchema = z
  .object({
    team: TeamSchema,
    members: z.array(TeamMemberSchema),
    pendingInvites: z.array(TeamInviteSchema),
  })
  .openapi("TeamDetail");

export const TeamCreateSchema = z
  .object({
    name: z.string().min(2).max(80),
    slug: SlugSchema,
    tag: z.string().min(2).max(5).optional(),
    color: z.string().max(9).optional(),
    description: z.string().max(500).optional(),
    sport: MpSportSchema.optional(),
    logoUrl: z.string().url().optional(),
    clubId: UuidSchema.optional(),
  })
  .openapi("TeamCreate");

export const InviteToTeamSchema = z
  .object({
    userId: UuidSchema,
  })
  .openapi("InviteToTeam");

export const TeamUpdateSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    description: z.string().max(500).nullable().optional(),
    sport: MpSportSchema.nullable().optional(),
    logoUrl: z.string().url().nullable().optional(),
    clubId: UuidSchema.nullable().optional(),
  })
  .openapi("TeamUpdate");

export const TeamSettingsPatchSchema = z
  .object({
    captainOnlyInvites: z.boolean().optional(),
    requireJoinApproval: z.boolean().optional(),
    showInRanking: z.boolean().optional(),
    allowExternalChatGuests: z.boolean().optional(),
  })
  .openapi("TeamSettingsPatch");

export const TeamAchievementSchema = z
  .object({
    id: UuidSchema,
    teamId: UuidSchema,
    kind: z.string().min(1).max(64),
    title: z.string().min(1).max(160),
    subtitle: z.string().max(280).nullable(),
    awardedAt: z.string(),
    awardedBy: UuidSchema.nullable(),
  })
  .openapi("TeamAchievement");

export const TeamAchievementGrantSchema = z
  .object({
    teamId: UuidSchema,
    kind: z.string().min(1).max(64),
    title: z.string().min(1).max(160),
    subtitle: z.string().max(280).optional(),
    awardedAt: z.string().datetime().optional(),
  })
  .openapi("TeamAchievementGrant");

export const TeamListParamsSchema = z
  .object({
    sport: MpSportSchema.optional(),
    clubId: UuidSchema.optional(),
    q: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(60).default(30),
  })
  .openapi("TeamListParams");

export type Team = z.infer<typeof TeamSchema>;
export type TeamDetail = z.infer<typeof TeamDetailSchema>;
export type TeamAchievement = z.infer<typeof TeamAchievementSchema>;
export type TeamSettingsPatch = z.infer<typeof TeamSettingsPatchSchema>;
export type Friend = z.infer<typeof FriendSchema>;
export type FriendRequest = z.infer<typeof FriendRequestSchema>;
