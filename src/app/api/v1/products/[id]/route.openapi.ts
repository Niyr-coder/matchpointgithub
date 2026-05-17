import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { ProductSchema } from "@/lib/schemas/proshop";

registry.registerPath({
  method: "get",
  path: "/api/v1/products/{id}",
  tags: ["ProShop"],
  summary: "Get a product by id (public)",
  request: { params: z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) }) },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(ProductSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
