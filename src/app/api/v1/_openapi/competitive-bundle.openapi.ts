// Consolidated OpenAPI: ranking + tournaments + events.
import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import {
  MatchResultReportSchema,
  MatchResultSchema,
  RankingEntrySchema,
  RankingListParamsSchema,
  RankingSnapshotSchema,
} from "@/lib/schemas/ranking";
import {
  BracketSchema,
  LeagueCreateSchema,
  LeagueSchema,
  RegistrationSchema,
  TournamentCreateSchema,
  TournamentDetailSchema,
  TournamentListParamsSchema,
  TournamentRegisterSchema,
  TournamentSchema,
} from "@/lib/schemas/tournaments";
import {
  EventCreateSchema,
  EventListParamsSchema,
  EventRegistrationSchema,
  EventSchema,
} from "@/lib/schemas/events";
import { MpSportSchema, UuidSchema } from "@/lib/schemas/common";

const idPath = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });
const idOrSlug = z.object({
  idOrSlug: z.string().openapi({ param: { name: "idOrSlug", in: "path" } }),
});
const errAuth = { 401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } } };

// ── ranking ────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/ranking",
  tags: ["Ranking"],
  summary: "Leaderboard (public). Sport filter required",
  request: { query: RankingListParamsSchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(RankingEntrySchema)) } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/users/{id}/ranking-history",
  tags: ["Ranking"],
  summary: "Rating snapshots over time",
  request: {
    params: idPath,
    query: z.object({
      sport: MpSportSchema,
      fromDate: z.string().datetime({ offset: true }).optional(),
      limit: z.coerce.number().int().optional(),
    }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(RankingSnapshotSchema)) } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/matches/results",
  tags: ["Ranking"],
  summary: "Submit a match result (one participant). Status starts as 'reported'",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: MatchResultReportSchema } } } },
  responses: {
    201: { description: "Reported", content: { "application/json": { schema: ApiOkSchema(MatchResultSchema) } } },
    ...errAuth,
    422: { description: "Sides uneven", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/matches/results/{id}/confirm",
  tags: ["Ranking"],
  summary: "Confirm a reported result (another participant). Triggers ranking recompute",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: { description: "Confirmed", content: { "application/json": { schema: ApiOkSchema(MatchResultSchema) } } },
    ...errAuth,
    409: { description: "Not in 'reported' state", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

// ── leagues / tournaments / brackets ───────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/leagues",
  tags: ["Tournaments"],
  summary: "List active/finished leagues (public)",
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(LeagueSchema)) } } } },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/leagues",
  tags: ["Tournaments"],
  summary: "Create a league (partner-admin)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: LeagueCreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(LeagueSchema) } } },
    409: { description: "Slug taken", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/tournaments",
  tags: ["Tournaments"],
  summary: "List tournaments (public). Excludes draft/cancelled",
  request: { query: TournamentListParamsSchema },
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(TournamentSchema)) } } } },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/tournaments",
  tags: ["Tournaments"],
  summary: "Create a tournament (partner-admin)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: TournamentCreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(TournamentSchema) } } },
    409: { description: "Slug taken", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/tournaments/{idOrSlug}",
  tags: ["Tournaments"],
  summary: "Tournament detail with categories + counts",
  request: { params: idOrSlug },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(TournamentDetailSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/tournaments/{idOrSlug}/register",
  tags: ["Tournaments"],
  summary: "Register a team or duo to a tournament. Idempotent. Accepts UUID or slug",
  security: [{ cookieAuth: [] }],
  request: {
    params: idOrSlug,
    headers: z.object({ "Idempotency-Key": z.string().uuid().optional() }),
    body: { content: { "application/json": { schema: TournamentRegisterSchema } } },
  },
  responses: {
    201: { description: "Registered (status starts as 'pending')", content: { "application/json": { schema: ApiOkSchema(RegistrationSchema) } } },
    422: { description: "Registration closed", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/brackets/{id}",
  tags: ["Tournaments"],
  summary: "Bracket detail with all matches",
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(BracketSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/tournaments/registrations/{id}/status",
  tags: ["Tournaments"],
  summary: "Actualizar estado de una inscripción (partner-admin)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            status: z.enum(["accepted", "pending", "rejected", "withdrawn"]),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Actualizado", content: { "application/json": { schema: ApiOkSchema(RegistrationSchema) } } },
    ...errAuth,
    403: { description: "Partner-admin requerido", content: { "application/json": { schema: ApiErrorSchema } } },
    404: { description: "Inscripción no encontrada", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/tournaments/{idOrSlug}/generate-bracket",
  tags: ["Tournaments"],
  summary: "Generar bracket de eliminación simple para un torneo (partner-admin)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idOrSlug,
    body: {
      content: {
        "application/json": {
          schema: z.object({ categoryId: UuidSchema.optional() }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Bracket creado",
      content: { "application/json": { schema: ApiOkSchema(z.object({ bracketId: UuidSchema, size: z.number().int() })) } },
    },
    ...errAuth,
    404: { description: "Tournament no encontrado", content: { "application/json": { schema: ApiErrorSchema } } },
    422: { description: "Menos de 2 inscripciones aceptadas", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

// ── events ─────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/events",
  tags: ["Events"],
  summary: "List events (public). Excludes draft/cancelled",
  request: { query: EventListParamsSchema },
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(EventSchema)) } } } },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/events",
  tags: ["Events"],
  summary: "Create an event (club staff or partner-admin)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: EventCreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(EventSchema) } } },
    409: { description: "Slug taken", content: { "application/json": { schema: ApiErrorSchema } } },
    422: { description: "Missing clubId/partnerId", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/events/{idOrSlug}",
  tags: ["Events"],
  summary: "Get an event (public)",
  request: { params: idOrSlug },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(EventSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/events/{idOrSlug}/publish",
  tags: ["Events"],
  summary: "Publish a draft event. Accepts UUID or slug",
  security: [{ cookieAuth: [] }],
  request: { params: idOrSlug },
  responses: {
    200: { description: "Published", content: { "application/json": { schema: ApiOkSchema(EventSchema) } } },
    409: { description: "Not in draft", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/events/{idOrSlug}/register",
  tags: ["Events"],
  summary: "Register the current user to an event. Idempotent. Accepts UUID or slug",
  security: [{ cookieAuth: [] }],
  request: {
    params: idOrSlug,
    headers: z.object({ "Idempotency-Key": z.string().uuid().optional() }),
  },
  responses: {
    201: { description: "Registered", content: { "application/json": { schema: ApiOkSchema(EventRegistrationSchema) } } },
    409: { description: "Event full or already registered", content: { "application/json": { schema: ApiErrorSchema } } },
    422: { description: "Event not in a registerable state", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
