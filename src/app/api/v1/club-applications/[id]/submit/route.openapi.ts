import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import {
  ClubApplicationSchema,
  SubmitApplicationSchema,
} from "@/lib/schemas/clubApplications";
import { z } from "zod";

registry.registerPath({
  method: "post",
  path: "/api/v1/club-applications/{id}/submit",
  tags: ["ClubApplications"],
  summary: "Submit a draft application for review",
  description:
    "Transitions status `draft → submitted`. Requires the applicant to have accepted terms " +
    "and the basics (name, taxId, contactEmail, address) to be present.",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) }),
    body: { content: { "application/json": { schema: SubmitApplicationSchema } } },
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(ClubApplicationSchema) } },
    },
    409: { description: "Cannot submit in current state", content: { "application/json": { schema: ApiErrorSchema } } },
    422: { description: "Missing required fields", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
