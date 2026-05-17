import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { CourtSchema, CourtUpdateSchema } from "@/lib/schemas/courts";

const idParam = z.object({
  id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
});

registry.registerPath({
  method: "get",
  path: "/api/v1/courts/{id}",
  tags: ["Courts"],
  summary: "Get a court (public)",
  request: { params: idParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(CourtSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/courts/{id}",
  tags: ["Courts"],
  summary: "Update a court (owner/manager)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: CourtUpdateSchema } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(CourtSchema) } } },
    400: { description: "Validation failed", content: { "application/json": { schema: ApiErrorSchema } } },
    403: { description: "Role required", content: { "application/json": { schema: ApiErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Court code already exists in this club", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/courts/{id}",
  tags: ["Courts"],
  summary: "Archive a court (soft delete via active=false)",
  security: [{ cookieAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(CourtSchema) } } },
    403: { description: "Role required", content: { "application/json": { schema: ApiErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
