import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { ClubApplicationSchema } from "@/lib/schemas/clubApplications";
import { z } from "zod";

registry.registerPath({
  method: "get",
  path: "/api/v1/me/club-application",
  tags: ["ClubApplications"],
  summary: "Get the current user's most recent club application (if any)",
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(ClubApplicationSchema.nullable()) } },
    },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
void z;
