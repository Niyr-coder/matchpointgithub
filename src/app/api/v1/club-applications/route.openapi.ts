import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { ClubApplicationSchema } from "@/lib/schemas/clubApplications";

registry.registerPath({
  method: "post",
  path: "/api/v1/club-applications",
  tags: ["ClubApplications"],
  summary: "Start a new club application (draft)",
  description:
    "Creates an empty draft bound to the current user. Fails with 409 ALREADY_OPEN " +
    "if the user already has an active application (draft or any review status).",
  security: [{ cookieAuth: [] }],
  responses: {
    201: {
      description: "Draft created",
      content: { "application/json": { schema: ApiOkSchema(ClubApplicationSchema) } },
    },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Already has an active application", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
