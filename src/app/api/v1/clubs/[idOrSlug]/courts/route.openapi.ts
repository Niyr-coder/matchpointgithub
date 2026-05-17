import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { CourtSchema } from "@/lib/schemas/courts";

registry.registerPath({
  method: "get",
  path: "/api/v1/clubs/{idOrSlug}/courts",
  tags: ["Courts"],
  summary: "List courts of a club (public). Accepts UUID or slug",
  request: {
    params: z.object({ idOrSlug: z.string().openapi({ param: { name: "idOrSlug", in: "path" } }) }),
    query: z.object({ includeInactive: z.coerce.boolean().optional() }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(CourtSchema)) } } },
    404: { description: "Club not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
