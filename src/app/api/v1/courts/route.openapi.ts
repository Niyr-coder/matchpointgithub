import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { CourtCreateSchema, CourtSchema } from "@/lib/schemas/courts";

registry.registerPath({
  method: "post",
  path: "/api/v1/courts",
  tags: ["Courts"],
  summary: "Create a court (owner/manager)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: CourtCreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(CourtSchema) } } },
    400: { description: "Validation failed", content: { "application/json": { schema: ApiErrorSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
    403: { description: "Role required", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Court code already exists in this club", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
