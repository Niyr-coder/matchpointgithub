// Consolidated OpenAPI: notifications + marketing + moderation + support + flags + partners.
import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import {
  NotificationKindSchema,
  NotificationListParamsSchema,
  NotificationPreferenceSchema,
  NotificationSchema,
  UpdatePreferencesSchema,
} from "@/lib/schemas/notifications";
import {
  ActOnReportSchema,
  BroadcastCreateSchema,
  BroadcastListParamsSchema,
  BroadcastSchema,
  FeatureFlagSchema,
  FeatureFlagUpsertSchema,
  PartnerCreateSchema,
  PartnerDetailSchema,
  PartnerOrgSchema,
  ReportCreateSchema,
  ReportSchema,
  ReportStatusSchema,
  TicketCreateSchema,
  TicketDetailSchema,
  TicketMessageSchema,
  TicketReplySchema,
  TicketSchema,
  TicketStatusSchema,
} from "@/lib/schemas/ops";
import { MpRoleSchema } from "@/lib/schemas/common";

const idPath = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });
const errAuth = { 401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } } };
const errAdmin = { 403: { description: "Admin required", content: { "application/json": { schema: ApiErrorSchema } } } };

// ── notifications ──────────────────────────────────────────────────────
registry.registerPath({
  method: "get", path: "/api/v1/notifications", tags: ["Notifications"],
  summary: "My notification feed (RLS-filtered by active role)",
  security: [{ cookieAuth: [] }],
  request: { query: NotificationListParamsSchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(NotificationSchema)) } } },
    ...errAuth,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/notifications/{id}/read", tags: ["Notifications"],
  summary: "Mark a single notification as read",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(NotificationSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/notifications/read-all", tags: ["Notifications"],
  summary: "Mark all my notifications as read (optionally per role)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: z.object({ role: MpRoleSchema.optional() }) } } } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ count: z.number().int() })) } } },
  },
});
registry.registerPath({
  method: "get", path: "/api/v1/me/notification-preferences", tags: ["Notifications"],
  summary: "List my notification preferences",
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(NotificationPreferenceSchema)) } } },
  },
});
registry.registerPath({
  method: "patch", path: "/api/v1/me/notification-preferences", tags: ["Notifications"],
  summary: "Batch upsert preferences",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: UpdatePreferencesSchema } } } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ count: z.number().int() })) } } },
  },
});
registry.registerPath({
  method: "get", path: "/api/v1/notification-kinds", tags: ["Notifications"],
  summary: "Catalog of notification kinds (auth required)",
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(NotificationKindSchema)) } } },
  },
});

// ── broadcasts ─────────────────────────────────────────────────────────
registry.registerPath({
  method: "get", path: "/api/v1/broadcasts", tags: ["Broadcasts"],
  summary: "List broadcasts (filtered by RLS)",
  security: [{ cookieAuth: [] }],
  request: { query: BroadcastListParamsSchema },
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(BroadcastSchema)) } } } },
});
registry.registerPath({
  method: "post", path: "/api/v1/broadcasts", tags: ["Broadcasts"],
  summary: "Create a broadcast (admin / club staff / partner-admin per scope)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: BroadcastCreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(BroadcastSchema) } } },
    422: { description: "Scope/club/partner mismatch", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/broadcasts/{id}/cancel", tags: ["Broadcasts"],
  summary: "Cancel a draft/scheduled broadcast",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: { description: "Cancelled", content: { "application/json": { schema: ApiOkSchema(BroadcastSchema) } } },
    409: { description: "Already sent", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

// ── moderation ─────────────────────────────────────────────────────────
registry.registerPath({
  method: "post", path: "/api/v1/reports", tags: ["Moderation"],
  summary: "Report content (any user)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: ReportCreateSchema } } } },
  responses: {
    201: { description: "Reported", content: { "application/json": { schema: ApiOkSchema(ReportSchema) } } },
  },
});
registry.registerPath({
  method: "get", path: "/api/v1/admin/reports", tags: ["Moderation"],
  summary: "List reports (admin)",
  security: [{ cookieAuth: [] }],
  request: { query: z.object({ status: ReportStatusSchema.optional(), limit: z.coerce.number().int().optional() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(ReportSchema)) } } },
    ...errAdmin,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/admin/reports/{id}/act", tags: ["Moderation"],
  summary: "Act on a report (admin)",
  security: [{ cookieAuth: [] }],
  request: { params: idPath, body: { content: { "application/json": { schema: ActOnReportSchema } } } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(ReportSchema) } } },
    ...errAdmin,
  },
});

// ── support ────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get", path: "/api/v1/tickets", tags: ["Support"],
  summary: "List my tickets",
  security: [{ cookieAuth: [] }],
  request: { query: z.object({ status: TicketStatusSchema.optional(), limit: z.coerce.number().int().optional() }) },
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(TicketSchema)) } } } },
});
registry.registerPath({
  method: "post", path: "/api/v1/tickets", tags: ["Support"],
  summary: "Open a ticket. Body becomes the first message",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: TicketCreateSchema } } } },
  responses: { 201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(TicketSchema) } } } },
});
registry.registerPath({
  method: "get", path: "/api/v1/tickets/{id}", tags: ["Support"],
  summary: "Ticket detail with messages",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(TicketDetailSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "delete", path: "/api/v1/tickets/{id}", tags: ["Support"],
  summary: "Close a ticket",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: { 200: { description: "Closed", content: { "application/json": { schema: ApiOkSchema(TicketSchema) } } } },
});
registry.registerPath({
  method: "post", path: "/api/v1/tickets/{id}/messages", tags: ["Support"],
  summary: "Reply to a ticket. internal=true hides from opener",
  security: [{ cookieAuth: [] }],
  request: { params: idPath, body: { content: { "application/json": { schema: TicketReplySchema } } } },
  responses: { 201: { description: "Sent", content: { "application/json": { schema: ApiOkSchema(TicketMessageSchema) } } } },
});

// ── feature flags ──────────────────────────────────────────────────────
registry.registerPath({
  method: "get", path: "/api/v1/admin/flags", tags: ["FeatureFlags"],
  summary: "List all flags (admin)",
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(FeatureFlagSchema)) } } },
    ...errAdmin,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/admin/flags", tags: ["FeatureFlags"],
  summary: "Upsert a flag (admin)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: FeatureFlagUpsertSchema } } } },
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(FeatureFlagSchema) } } } },
});
registry.registerPath({
  method: "delete", path: "/api/v1/admin/flags/{key}", tags: ["FeatureFlags"],
  summary: "Delete a flag (admin)",
  security: [{ cookieAuth: [] }],
  request: { params: z.object({ key: z.string().openapi({ param: { name: "key", in: "path" } }) }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    ...errAdmin,
  },
});
registry.registerPath({
  method: "get", path: "/api/v1/admin/flags/assignments", tags: ["FeatureFlags"],
  summary: "List flag assignments for a flag (admin)",
  security: [{ cookieAuth: [] }],
  request: { query: z.object({ flagKey: z.string().openapi({ param: { name: "flagKey", in: "query" } }) }) },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: ApiOkSchema(
            z.array(
              z.object({
                flag_key: z.string(),
                scope: z.string(),
                scope_id: z.string(),
                enabled: z.boolean(),
                reason: z.string().nullable(),
              }),
            ),
          ),
        },
      },
    },
    ...errAdmin,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/admin/flags/assignments", tags: ["FeatureFlags"],
  summary: "Upsert a flag assignment (admin)",
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            flagKey: z.string(),
            scope: z.enum(["user", "club", "role"]),
            scopeId: z.string(),
            enabled: z.boolean(),
            reason: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } } },
});
registry.registerPath({
  method: "delete", path: "/api/v1/admin/flags/assignments", tags: ["FeatureFlags"],
  summary: "Delete a flag assignment (admin)",
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            flagKey: z.string(),
            scope: z.enum(["user", "club", "role"]),
            scopeId: z.string(),
          }),
        },
      },
    },
  },
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } } },
});
registry.registerPath({
  method: "get", path: "/api/v1/me/flags", tags: ["FeatureFlags"],
  summary: "My effective flag map (resolved via cascade user > club > role > default)",
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.record(z.string(), z.boolean())) } } },
  },
});

// ── roles ──────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get", path: "/api/v1/roles/search-users", tags: ["Roles"],
  summary: "Search users by username/display name (admin)",
  security: [{ cookieAuth: [] }],
  request: { query: z.object({ q: z.string().openapi({ param: { name: "q", in: "query" } }) }) },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: ApiOkSchema(
            z.array(z.object({ id: z.string().uuid(), username: z.string(), display_name: z.string() })),
          ),
        },
      },
    },
    ...errAdmin,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/roles/assign", tags: ["Roles"],
  summary: "Assign a role to a user (admin)",
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            userId: z.string().uuid(),
            role: z.enum(["admin", "partner", "owner", "manager", "coach", "employee", "user"]),
            clubId: z.string().uuid().nullable().optional(),
            notes: z.string().max(500).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Assigned", content: { "application/json": { schema: ApiOkSchema(z.object({ id: z.string().uuid() })) } } },
    ...errAdmin,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/roles/revoke", tags: ["Roles"],
  summary: "Revoke a role assignment (admin)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: z.object({ assignmentId: z.string().uuid() }) } } } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    ...errAdmin,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/roles/requests/approve", tags: ["Roles"],
  summary: "Approve a role_request (admin)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: z.object({ requestId: z.string().uuid(), notes: z.string().max(500).optional() }) } } } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    ...errAdmin,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/roles/requests/reject", tags: ["Roles"],
  summary: "Reject a role_request (admin)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: z.object({ requestId: z.string().uuid(), notes: z.string().max(500).optional() }) } } } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    ...errAdmin,
  },
});

// ── partners ───────────────────────────────────────────────────────────
registry.registerPath({
  method: "get", path: "/api/v1/partners", tags: ["Partners"],
  summary: "List partner orgs",
  security: [{ cookieAuth: [] }],
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(PartnerOrgSchema)) } } } },
});
registry.registerPath({
  method: "post", path: "/api/v1/partners", tags: ["Partners"],
  summary: "Create a partner org (admin). Inserts the requested owner",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: PartnerCreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(PartnerOrgSchema) } } },
    409: { description: "Slug taken", content: { "application/json": { schema: ApiErrorSchema } } },
    ...errAdmin,
  },
});
registry.registerPath({
  method: "get", path: "/api/v1/partners/{id}", tags: ["Partners"],
  summary: "Partner detail with members and club link count",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(PartnerDetailSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/partners/{id}/club-links", tags: ["Partners"],
  summary: "Vincular un club a un partner (partner-admin)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            clubId: z.string().uuid(),
            revenueSharePct: z.number().min(0).max(100).default(0),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Vinculado", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    ...errAuth,
    403: { description: "Partner-admin requerido", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "delete", path: "/api/v1/partners/{id}/club-links/{clubId}", tags: ["Partners"],
  summary: "Desvincular un club de un partner (partner-admin)",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
      clubId: z.string().uuid().openapi({ param: { name: "clubId", in: "path" } }),
    }),
  },
  responses: {
    200: { description: "Desvinculado", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    ...errAuth,
    403: { description: "Partner-admin requerido", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

// ── payouts ────────────────────────────────────────────────────────────
const PayoutSchema = z
  .object({
    id: z.string().uuid(),
    scope: z.string(),
    club_id: z.string().uuid().nullable(),
    period_start: z.string(),
    period_end: z.string(),
    gross_cents: z.number().int(),
    commission_cents: z.number().int(),
    net_cents: z.number().int(),
    currency: z.string(),
    status: z.enum(["pending", "approved", "processing", "paid", "failed", "cancelled"]),
    provider_payout_id: z.string().nullable().optional(),
    paid_at: z.string().nullable().optional(),
    scheduled_for: z.string().nullable().optional(),
    created_at: z.string().optional(),
  })
  .openapi("Payout");

registry.registerPath({
  method: "get", path: "/api/v1/payouts", tags: ["Payouts"],
  summary: "Listar payouts (admin/staff). Filtros: clubId, status, limit",
  security: [{ cookieAuth: [] }],
  request: {
    query: z.object({
      clubId: z.string().uuid().optional(),
      status: z.enum(["pending", "approved", "processing", "paid", "failed", "cancelled"]).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(PayoutSchema)) } } },
    ...errAuth,
    ...errAdmin,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/payouts/process", tags: ["Payouts"],
  summary: "Procesar payouts pendientes del período [periodStart, periodEnd] (admin)",
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            periodStart: z.string(),
            periodEnd: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Procesado",
      content: { "application/json": { schema: ApiOkSchema(z.object({ created: z.number().int(), totalNetCents: z.number().int() })) } },
    },
    ...errAdmin,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/payouts/{id}/paid", tags: ["Payouts"],
  summary: "Marcar un payout como pagado (admin)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: { content: { "application/json": { schema: z.object({ providerPayoutId: z.string().optional() }) } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    ...errAdmin,
  },
});

// ── refunds ────────────────────────────────────────────────────────────
registry.registerPath({
  method: "post", path: "/api/v1/refunds", tags: ["Payouts"],
  summary: "Procesar un reembolso (club staff)",
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            transactionId: z.string().uuid(),
            amountCents: z.number().int().positive(),
            reason: z.string().min(1).max(500),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Reembolso creado",
      content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true), refundId: z.string().uuid() })) } },
    },
    404: { description: "Transacción no encontrada", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Transacción no capturada", content: { "application/json": { schema: ApiErrorSchema } } },
    422: { description: "Monto excede la transacción", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

// ── admin clubs ────────────────────────────────────────────────────────
registry.registerPath({
  method: "post", path: "/api/v1/admin/clubs/{id}/suspend", tags: ["Admin · Clubs"],
  summary: "Suspender un club (admin)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: { content: { "application/json": { schema: z.object({ reason: z.string().max(500).optional() }) } } },
  },
  responses: {
    200: { description: "Suspendido", content: { "application/json": { schema: ApiOkSchema(z.object({ id: z.string().uuid(), status: z.string() })) } } },
    ...errAdmin,
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/admin/clubs/{id}/activate", tags: ["Admin · Clubs"],
  summary: "Reactivar un club suspendido (admin)",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: { description: "Activo", content: { "application/json": { schema: ApiOkSchema(z.object({ id: z.string().uuid(), status: z.string() })) } } },
    ...errAdmin,
  },
});

// ── support assign / auto-assign ───────────────────────────────────────
registry.registerPath({
  method: "post", path: "/api/v1/tickets/{id}/assign", tags: ["Support"],
  summary: "Asignar un ticket a un admin (assigneeId=null lo deja sin asignar)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: { content: { "application/json": { schema: z.object({ assigneeId: z.string().uuid().nullable() }) } } },
  },
  responses: {
    200: { description: "Asignado", content: { "application/json": { schema: ApiOkSchema(TicketSchema) } } },
    404: { description: "Ticket no encontrado", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post", path: "/api/v1/tickets/auto-assign", tags: ["Support"],
  summary: "Reparto round-robin de tickets sin asignar entre admins activos (admin)",
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ assigned: z.number().int() })) } } },
    ...errAdmin,
    422: { description: "No hay admins activos", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

// ── notifications dismiss / unread-count ───────────────────────────────
registry.registerPath({
  method: "post", path: "/api/v1/notifications/{id}/dismiss", tags: ["Notifications"],
  summary: "Descartar una notificación (la marca como leída)",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    ...errAuth,
  },
});
registry.registerPath({
  method: "get", path: "/api/v1/notifications/unread-count", tags: ["Notifications"],
  summary: "Contador de notificaciones sin leer (para el badge)",
  security: [{ cookieAuth: [] }],
  request: { query: z.object({ role: MpRoleSchema.optional() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ count: z.number().int() })) } } },
    ...errAuth,
  },
});

export const _registered = true;
