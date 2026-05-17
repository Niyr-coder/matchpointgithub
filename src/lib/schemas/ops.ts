// Marketing broadcasts + moderation + support + feature-flags + partners.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, MpRoleSchema, SlugSchema, UuidSchema } from "./common";
import { NotificationChannelSchema } from "./notifications";

extendZodWithOpenApi(z);

// ── broadcasts ─────────────────────────────────────────────────────────
export const BroadcastSchema = z
  .object({
    id: UuidSchema,
    scope: z.enum(["platform", "club", "partner"]),
    clubId: UuidSchema.nullable(),
    partnerId: UuidSchema.nullable(),
    title: z.string(),
    body: z.string(),
    payload: z.record(z.string(), z.unknown()),
    channels: z.array(NotificationChannelSchema),
    targetFilter: z.record(z.string(), z.unknown()),
    scheduledFor: IsoDateTimeSchema.nullable(),
    sentAt: IsoDateTimeSchema.nullable(),
    status: z.enum(["draft", "scheduled", "sending", "sent", "cancelled"]),
    createdBy: UuidSchema,
    createdAt: IsoDateTimeSchema,
  })
  .openapi("Broadcast");

export const BroadcastCreateSchema = z
  .object({
    scope: z.enum(["platform", "club", "partner"]),
    clubId: UuidSchema.optional(),
    partnerId: UuidSchema.optional(),
    title: z.string().min(2).max(160),
    body: z.string().min(2).max(2000),
    channels: z.array(NotificationChannelSchema).min(1).default(["inapp"]),
    targetFilter: z.record(z.string(), z.unknown()).default({}),
    scheduledFor: IsoDateTimeSchema.optional(),
  })
  .openapi("BroadcastCreate");

export const BroadcastListParamsSchema = z
  .object({
    scope: z.enum(["platform", "club", "partner"]).optional(),
    clubId: UuidSchema.optional(),
    status: z.enum(["draft", "scheduled", "sending", "sent", "cancelled"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .openapi("BroadcastListParams");

// ── moderation ─────────────────────────────────────────────────────────
export const ReportStatusSchema = z
  .enum(["pending", "reviewing", "actioned", "dismissed"])
  .openapi("ReportStatus");

export const ReportSchema = z
  .object({
    id: UuidSchema,
    reporterId: UuidSchema,
    entity: z.string(),
    entityId: UuidSchema,
    reason: z.string(),
    details: z.string().nullable(),
    status: ReportStatusSchema,
    reviewedBy: UuidSchema.nullable(),
    reviewedAt: IsoDateTimeSchema.nullable(),
    resolutionNotes: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("Report");

export const ReportCreateSchema = z
  .object({
    entity: z.enum(["profile", "message", "review", "resource", "club"]),
    entityId: UuidSchema,
    reason: z.string().min(2).max(120),
    details: z.string().max(2000).optional(),
  })
  .openapi("ReportCreate");

export const ActOnReportSchema = z
  .object({
    action: z.enum(["warn", "remove_content", "suspend", "ban", "restore", "dismiss"]),
    durationHours: z.number().int().positive().optional(),
    reason: z.string().min(2).max(1000),
  })
  .openapi("ActOnReport");

// ── support ────────────────────────────────────────────────────────────
export const TicketSeveritySchema = z
  .enum(["low", "medium", "high", "critical"])
  .openapi("TicketSeverity");

export const TicketStatusSchema = z
  .enum(["open", "in_progress", "waiting_user", "resolved", "closed"])
  .openapi("TicketStatus");

export const TicketSchema = z
  .object({
    id: UuidSchema,
    code: z.string(),
    clubId: UuidSchema.nullable(),
    openerId: UuidSchema,
    assigneeId: UuidSchema.nullable(),
    subject: z.string(),
    category: z.enum(["maintenance", "system", "customer", "billing", "other"]),
    severity: TicketSeveritySchema,
    status: TicketStatusSchema,
    firstResponseAt: IsoDateTimeSchema.nullable(),
    resolvedAt: IsoDateTimeSchema.nullable(),
    closedAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("Ticket");

export const TicketMessageSchema = z
  .object({
    id: UuidSchema,
    ticketId: UuidSchema,
    authorId: UuidSchema,
    body: z.string(),
    internal: z.boolean(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("TicketMessage");

export const TicketDetailSchema = z
  .object({
    ticket: TicketSchema,
    messages: z.array(TicketMessageSchema),
  })
  .openapi("TicketDetail");

export const TicketCreateSchema = z
  .object({
    clubId: UuidSchema.optional(),
    subject: z.string().min(3).max(200),
    category: z.enum(["maintenance", "system", "customer", "billing", "other"]),
    severity: TicketSeveritySchema.default("medium"),
    body: z.string().min(3).max(4000),
  })
  .openapi("TicketCreate");

export const TicketReplySchema = z
  .object({
    body: z.string().min(1).max(4000),
    internal: z.boolean().default(false),
  })
  .openapi("TicketReply");

// ── feature flags ──────────────────────────────────────────────────────
export const FeatureFlagSchema = z
  .object({
    key: z.string(),
    description: z.string(),
    enabledDefault: z.boolean(),
    rolloutPct: z.number().int().min(0).max(100),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("FeatureFlag");

export const FeatureFlagUpsertSchema = z
  .object({
    key: z.string().min(2).max(80).regex(/^[a-z][a-z0-9_.-]*$/i),
    description: z.string().min(2).max(500),
    enabledDefault: z.boolean().default(false),
    rolloutPct: z.number().int().min(0).max(100).default(0),
  })
  .openapi("FeatureFlagUpsert");

// ── partners ───────────────────────────────────────────────────────────
export const PartnerOrgSchema = z
  .object({
    id: UuidSchema,
    slug: SlugSchema,
    name: z.string(),
    description: z.string().nullable(),
    logoUrl: z.string().url().nullable(),
    country: z.string().nullable(),
    contactEmail: z.string().email().nullable(),
    status: z.enum(["pending", "active", "suspended", "archived"]),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("PartnerOrg");

export const PartnerMemberSchema = z
  .object({
    partnerId: UuidSchema,
    userId: UuidSchema,
    role: z.enum(["owner", "admin", "member"]),
    joinedAt: IsoDateTimeSchema,
  })
  .openapi("PartnerMember");

export const PartnerDetailSchema = z
  .object({
    partner: PartnerOrgSchema,
    members: z.array(PartnerMemberSchema),
    clubLinkCount: z.number().int(),
  })
  .openapi("PartnerDetail");

export const PartnerCreateSchema = z
  .object({
    name: z.string().min(2).max(160),
    slug: SlugSchema,
    description: z.string().max(2000).optional(),
    country: z.string().max(80).optional(),
    contactEmail: z.string().email().optional(),
    ownerUserId: UuidSchema,
  })
  .openapi("PartnerCreate");

export const MpRoleEnumSchema = MpRoleSchema; // re-export for openapi naming
export type Broadcast = z.infer<typeof BroadcastSchema>;
export type Report = z.infer<typeof ReportSchema>;
export type Ticket = z.infer<typeof TicketSchema>;
export type TicketDetail = z.infer<typeof TicketDetailSchema>;
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type PartnerOrg = z.infer<typeof PartnerOrgSchema>;
