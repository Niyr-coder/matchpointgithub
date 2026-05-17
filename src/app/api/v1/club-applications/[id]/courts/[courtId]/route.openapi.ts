import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import {
  ClubApplicationCourtSchema,
  ClubApplicationCourtUpdateSchema,
} from "@/lib/schemas/clubApplications";
import { z } from "zod";

const idParams = z.object({
  id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
  courtId: z.string().uuid().openapi({ param: { name: "courtId", in: "path" } }),
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/club-applications/{id}/courts/{courtId}",
  tags: ["ClubApplications"],
  summary: "Update a proposed court",
  security: [{ cookieAuth: [] }],
  request: {
    params: idParams,
    body: { content: { "application/json": { schema: ClubApplicationCourtUpdateSchema } } },
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(ClubApplicationCourtSchema) } },
    },
    400: { description: "Validation failed", content: { "application/json": { schema: ApiErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/club-applications/{id}/courts/{courtId}",
  tags: ["ClubApplications"],
  summary: "Remove a proposed court",
  security: [{ cookieAuth: [] }],
  request: { params: idParams },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) },
      },
    },
  },
});

export const _registered = true;
