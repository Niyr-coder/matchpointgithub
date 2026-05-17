import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { SessionResponseSchema } from "@/lib/schemas/identity";

registry.registerPath({
  method: "get",
  path: "/api/v1/me",
  tags: ["Profile"],
  summary: "Current session: profile + roles + active scope",
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(SessionResponseSchema) } },
    },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
    404: { description: "Profile not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
