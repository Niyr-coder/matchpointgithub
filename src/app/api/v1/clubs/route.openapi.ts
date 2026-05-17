import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { ClubListParamsSchema, ClubSchema } from "@/lib/schemas/clubs";

registry.registerPath({
  method: "get",
  path: "/api/v1/clubs",
  tags: ["Clubs"],
  summary: "List active clubs (public)",
  request: { query: ClubListParamsSchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(ClubSchema)) } } },
    400: { description: "Validation failed", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
