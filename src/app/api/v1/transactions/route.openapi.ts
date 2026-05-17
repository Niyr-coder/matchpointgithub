import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import {
  TransactionCreateSchema,
  TransactionListParamsSchema,
  TransactionSchema,
} from "@/lib/schemas/cash";

registry.registerPath({
  method: "get",
  path: "/api/v1/transactions",
  tags: ["Cash"],
  summary: "List transactions for a club (staff)",
  security: [{ cookieAuth: [] }],
  request: { query: TransactionListParamsSchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(TransactionSchema)) } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/transactions",
  tags: ["Cash"],
  summary: "Record a transaction (employee/coach/manager). Auto-attaches to the club's open cash session",
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({ "Idempotency-Key": z.string().uuid().optional() }),
    body: { content: { "application/json": { schema: TransactionCreateSchema } } },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(TransactionSchema) } } },
    422: { description: "Cash without open session, or business rule violation", content: { "application/json": { schema: ApiErrorSchema } } },
    429: { description: "Rate limit", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
