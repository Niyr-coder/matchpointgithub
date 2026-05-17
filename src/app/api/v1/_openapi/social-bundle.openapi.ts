// Consolidated OpenAPI: messaging + friends + teams.
import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import {
  ConversationDetailSchema,
  ConversationSchema,
  ConversationSummarySchema,
  MarkReadSchema,
  MessageSchema,
  SendMessageSchema,
  StartConversationSchema,
} from "@/lib/schemas/messaging";
import {
  FriendRequestSchema,
  FriendSchema,
  InviteToTeamSchema,
  SendFriendRequestSchema,
  TeamCreateSchema,
  TeamDetailSchema,
  TeamInviteSchema,
  TeamListParamsSchema,
  TeamSchema,
} from "@/lib/schemas/social";
import { UuidSchema } from "@/lib/schemas/common";

const idPath = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });
const errAuth = { 401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } } };

// ── messaging ──────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/conversations",
  tags: ["Messaging"],
  summary: "List my conversations (with last message + unread count)",
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(ConversationSummarySchema)) } } },
    ...errAuth,
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/conversations",
  tags: ["Messaging"],
  summary: "Start a conversation. DMs with one other user reuse an existing thread",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: StartConversationSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(ConversationSchema) } } },
    ...errAuth,
    429: { description: "Rate limit", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/conversations/{id}",
  tags: ["Messaging"],
  summary: "Conversation detail with members and recent messages",
  security: [{ cookieAuth: [] }],
  request: { params: idPath, query: z.object({ limit: z.coerce.number().int().optional() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(ConversationDetailSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/conversations/{id}/messages",
  tags: ["Messaging"],
  summary: "Send a message",
  security: [{ cookieAuth: [] }],
  request: { params: idPath, body: { content: { "application/json": { schema: SendMessageSchema } } } },
  responses: {
    201: { description: "Sent", content: { "application/json": { schema: ApiOkSchema(MessageSchema) } } },
    403: { description: "Not a member", content: { "application/json": { schema: ApiErrorSchema } } },
    429: { description: "Rate limit", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/conversations/{id}/read",
  tags: ["Messaging"],
  summary: "Mark conversation as read up to a message id",
  security: [{ cookieAuth: [] }],
  request: { params: idPath, body: { content: { "application/json": { schema: MarkReadSchema } } } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
  },
});

// ── friends ────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/me/friends",
  tags: ["Friends"],
  summary: "List my accepted friends",
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(FriendSchema)) } } },
    ...errAuth,
  },
});
registry.registerPath({
  method: "delete",
  path: "/api/v1/me/friends",
  tags: ["Friends"],
  summary: "Remove a friend",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: z.object({ userId: UuidSchema }) } } } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/me/friend-requests",
  tags: ["Friends"],
  summary: "List pending friend requests (incoming/outgoing/all)",
  security: [{ cookieAuth: [] }],
  request: { query: z.object({ direction: z.enum(["incoming", "outgoing", "all"]).optional() }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(FriendRequestSchema)) } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/me/friend-requests",
  tags: ["Friends"],
  summary: "Send a friend request",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: SendFriendRequestSchema } } } },
  responses: {
    201: { description: "Sent", content: { "application/json": { schema: ApiOkSchema(FriendRequestSchema) } } },
    409: { description: "Already requested", content: { "application/json": { schema: ApiErrorSchema } } },
    422: { description: "Cannot friend self", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/me/friend-requests/{id}/accept",
  tags: ["Friends"],
  summary: "Accept a pending friend request",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/me/friend-requests/{id}/reject",
  tags: ["Friends"],
  summary: "Reject a pending friend request",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
  },
});

// ── teams ──────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/teams",
  tags: ["Teams"],
  summary: "List teams (public)",
  request: { query: TeamListParamsSchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(TeamSchema)) } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/teams",
  tags: ["Teams"],
  summary: "Create a team (the creator becomes captain)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: TeamCreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(TeamSchema) } } },
    409: { description: "Slug taken", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/teams/{id}",
  tags: ["Teams"],
  summary: "Team detail with members and pending invites",
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(TeamDetailSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/teams/{id}/invites",
  tags: ["Teams"],
  summary: "Invite a user (captain only)",
  security: [{ cookieAuth: [] }],
  request: { params: idPath, body: { content: { "application/json": { schema: InviteToTeamSchema } } } },
  responses: {
    201: { description: "Invited", content: { "application/json": { schema: ApiOkSchema(TeamInviteSchema) } } },
    403: { description: "Captain only", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Already invited", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/team-invites/{id}/accept",
  tags: ["Teams"],
  summary: "Accept a pending team invite",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
