// Notification schemas: kinds catalog, user feed, preferences.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, MpRoleSchema, UuidSchema } from "./common";

extendZodWithOpenApi(z);

export const NotificationChannelSchema = z
  .enum(["inapp", "email", "push"])
  .openapi("NotificationChannel");

export const NotificationKindSchema = z
  .object({
    kind: z.string(),
    description: z.string(),
    allowedRoles: z.array(MpRoleSchema),
    defaultChannels: z.array(NotificationChannelSchema),
    category: z.string(),
  })
  .openapi("NotificationKind");

export const NotificationSchema = z
  .object({
    id: UuidSchema,
    recipientUserId: UuidSchema,
    recipientRole: MpRoleSchema,
    kind: z.string(),
    title: z.string(),
    body: z.string().nullable(),
    payload: z.record(z.string(), z.unknown()),
    readAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("Notification");

export const NotificationPreferenceSchema = z
  .object({
    role: MpRoleSchema,
    kind: z.string(),
    channel: NotificationChannelSchema,
    enabled: z.boolean(),
  })
  .openapi("NotificationPreference");

export const NotificationListParamsSchema = z
  .object({
    role: MpRoleSchema.optional(),
    unread: z.coerce.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .openapi("NotificationListParams");

export const UpdatePreferencesSchema = z
  .object({
    items: z
      .array(
        z.object({
          role: MpRoleSchema,
          kind: z.string(),
          channel: NotificationChannelSchema,
          enabled: z.boolean(),
        }),
      )
      .min(1)
      .max(200),
  })
  .openapi("UpdateNotificationPreferences");

export type Notification = z.infer<typeof NotificationSchema>;
