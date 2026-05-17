import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiOkSchema } from "@/lib/schemas/envelope";
import { ProductListParamsSchema, ProductSchema } from "@/lib/schemas/proshop";

registry.registerPath({
  method: "get",
  path: "/api/v1/products",
  tags: ["ProShop"],
  summary: "List pro shop products (public). Filters: clubId, q, categoryId, activeOnly",
  request: { query: ProductListParamsSchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(ProductSchema)) } } },
  },
});

export const _registered = true;
