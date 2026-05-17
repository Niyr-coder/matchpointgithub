import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { ClubDetailSchema, ClubSchema, ClubUpdateSchema } from "@/lib/schemas/clubs";

const idOrSlug = z.object({
  idOrSlug: z.string().openapi({ param: { name: "idOrSlug", in: "path" } }),
});

registry.registerPath({
  method: "get",
  path: "/api/v1/clubs/{idOrSlug}",
  tags: ["Clubs"],
  summary: "Get a club detail (public). Accepts UUID or slug",
  request: { params: idOrSlug },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(ClubDetailSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/clubs/{idOrSlug}",
  tags: ["Clubs"],
  summary: "Update a club (owner/manager). Optimistic-locked via expectedVersion",
  security: [{ cookieAuth: [] }],
  request: {
    params: idOrSlug,
    body: { content: { "application/json": { schema: ClubUpdateSchema } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(ClubSchema) } } },
    400: { description: "Validation failed", content: { "application/json": { schema: ApiErrorSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
    403: { description: "Role required", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Concurrent update — reload and retry", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
