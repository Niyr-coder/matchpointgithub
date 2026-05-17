import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import {
  ClubApplicationCourtCreateSchema,
  ClubApplicationCourtSchema,
} from "@/lib/schemas/clubApplications";
import { z } from "zod";

registry.registerPath({
  method: "post",
  path: "/api/v1/club-applications/{id}/courts",
  tags: ["ClubApplications"],
  summary: "Add a proposed court to an application",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) }),
    body: { content: { "application/json": { schema: ClubApplicationCourtCreateSchema } } },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: ApiOkSchema(ClubApplicationCourtSchema) } },
    },
    400: { description: "Validation failed", content: { "application/json": { schema: ApiErrorSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
