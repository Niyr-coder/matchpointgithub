import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { SaleCreateSchema, SaleSchema } from "@/lib/schemas/proshop";

registry.registerPath({
  method: "post",
  path: "/api/v1/sales",
  tags: ["ProShop"],
  summary: "Quick-sale (employee POS). Creates transaction + sale + decrements stock",
  description:
    "Validates stock and currency mix, attaches to open cash session for cash payments. Idempotent via Idempotency-Key.",
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({ "Idempotency-Key": z.string().uuid().optional() }),
    body: { content: { "application/json": { schema: SaleCreateSchema } } },
  },
  responses: {
    201: { description: "Sold", content: { "application/json": { schema: ApiOkSchema(SaleSchema) } } },
    403: { description: "Role required", content: { "application/json": { schema: ApiErrorSchema } } },
    404: { description: "Product not found", content: { "application/json": { schema: ApiErrorSchema } } },
    422: { description: "Stock/inactive/club mismatch/currency/cash session closed", content: { "application/json": { schema: ApiErrorSchema } } },
    429: { description: "Rate limit", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
