import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { CashSessionOpenSchema, CashSessionSchema } from "@/lib/schemas/cash";
import { UuidSchema } from "@/lib/schemas/common";

registry.registerPath({
  method: "get",
  path: "/api/v1/cash/sessions",
  tags: ["Cash"],
  summary: "List cash sessions for a club (staff only)",
  security: [{ cookieAuth: [] }],
  request: {
    query: z.object({
      clubId: UuidSchema,
      status: z.enum(["open", "closed", "reconciled"]).optional(),
      limit: z.coerce.number().int().optional(),
    }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(CashSessionSchema)) } } },
    403: { description: "Role required", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/cash/sessions",
  tags: ["Cash"],
  summary: "Open a new cash session (staff). Fails if one is already open for the club",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: CashSessionOpenSchema } } } },
  responses: {
    201: { description: "Opened", content: { "application/json": { schema: ApiOkSchema(CashSessionSchema) } } },
    403: { description: "Role required", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Session already open", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
