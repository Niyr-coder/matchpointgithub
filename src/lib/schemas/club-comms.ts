import { z } from "zod";
import { UuidSchema } from "./common";

export const ClubIdOnlySchema = z.object({ clubId: UuidSchema });

export const PublishClubAnnouncementSchema = z.object({
  clubId: UuidSchema,
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(4000),
});

export const CreateClubGiveawaySchema = z.object({
  clubId: UuidSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  prizeLabel: z.string().trim().min(1).max(200),
  eligibility: z.enum(["followers", "members", "all"]).default("followers"),
  maxWinners: z.coerce.number().int().min(1).max(20).default(1),
  closesAt: z.string().datetime().optional(),
  publish: z.boolean().default(true),
});

export const GiveawayIdSchema = z.object({ giveawayId: UuidSchema });

export const EnterClubGiveawaySchema = z.object({ giveawayId: UuidSchema });

export const ClubGiveawayViewSchema = z.object({
  id: UuidSchema,
  clubId: UuidSchema,
  conversationId: UuidSchema,
  messageId: UuidSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  prizeLabel: z.string(),
  eligibility: z.enum(["followers", "members", "all"]),
  status: z.enum(["draft", "open", "closed", "drawn", "cancelled"]),
  maxWinners: z.number().int(),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  drawnAt: z.string().nullable(),
  entryCount: z.number().int(),
  hasEntered: z.boolean(),
  winners: z.array(
    z.object({
      userId: UuidSchema,
      displayName: z.string(),
      rank: z.number().int(),
    }),
  ),
});

export type ClubGiveawayView = z.infer<typeof ClubGiveawayViewSchema>;
