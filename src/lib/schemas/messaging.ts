// Messaging schemas: conversations, messages, members.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, UuidSchema } from "./common";

extendZodWithOpenApi(z);

export const ConversationKindSchema = z
  .enum(["dm", "group", "support", "club_channel", "club_announcements"])
  .openapi("ConversationKind");

export const MessageKindSchema = z
  .enum([
    "text",
    "image",
    "file",
    "system",
    "reservation_invite",
    "announcement_post",
    "giveaway_post",
    "giveaway_result",
  ])
  .openapi("MessageKind");

export const ConversationMemberSchema = z
  .object({
    userId: UuidSchema,
    role: z.enum(["member", "admin"]),
    joinedAt: IsoDateTimeSchema,
    leftAt: IsoDateTimeSchema.nullable(),
    lastReadMessageId: UuidSchema.nullable(),
  })
  .openapi("ConversationMember");

export const MessageSchema = z
  .object({
    id: UuidSchema,
    conversationId: UuidSchema,
    senderId: UuidSchema,
    body: z.string().nullable(),
    kind: MessageKindSchema,
    payload: z.record(z.string(), z.unknown()).nullable(),
    replyToId: UuidSchema.nullable(),
    editedAt: IsoDateTimeSchema.nullable(),
    deletedAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("Message");

export const ConversationSchema = z
  .object({
    id: UuidSchema,
    kind: ConversationKindSchema,
    title: z.string().nullable(),
    clubId: UuidSchema.nullable(),
    createdBy: UuidSchema,
    lastMessageAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("Conversation");

export const ConversationSummarySchema = z
  .object({
    conversation: ConversationSchema,
    lastMessage: MessageSchema.nullable(),
    unreadCount: z.number().int(),
    members: z.array(
      z.object({
        userId: UuidSchema,
        displayName: z.string(),
        avatarUrl: z.string().url().nullable(),
      }),
    ),
  })
  .openapi("ConversationSummary");

export const ConversationDetailSchema = z
  .object({
    conversation: ConversationSchema,
    members: z.array(ConversationMemberSchema),
    messages: z.array(MessageSchema),
  })
  .openapi("ConversationDetail");

export const StartConversationSchema = z
  .object({
    kind: ConversationKindSchema.default("dm"),
    memberIds: z.array(UuidSchema).min(1).max(50),
    title: z.string().max(120).optional(),
    clubId: UuidSchema.optional(),
  })
  .openapi("StartConversation");

export const SendMessageSchema = z
  .object({
    body: z.string().min(1).max(4000),
    kind: MessageKindSchema.default("text"),
    payload: z.record(z.string(), z.unknown()).optional(),
    replyToId: UuidSchema.optional(),
  })
  .openapi("SendMessage");

export const MarkReadSchema = z
  .object({
    lastMessageId: UuidSchema,
  })
  .openapi("MarkRead");

export type Conversation = z.infer<typeof ConversationSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;
