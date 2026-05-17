import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { CashSessionCloseSchema, CashSessionSchema } from "@/lib/schemas/cash";

registry.registerPath({
  method: "post",
  path: "/api/v1/cash/sessions/{id}/close",
  tags: ["Cash"],
  summary: "Close an open cash session. Computes expected and variance from captured cash txs",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) }),
    body: { content: { "application/json": { schema: CashSessionCloseSchema } } },
  },
  responses: {
    200: { description: "Closed", content: { "application/json": { schema: ApiOkSchema(CashSessionSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Session not open", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
