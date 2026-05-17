import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { ReservationDetailSchema } from "@/lib/schemas/reservations";

registry.registerPath({
  method: "get",
  path: "/api/v1/reservations/{id}",
  tags: ["Reservations"],
  summary: "Get a reservation with its participants",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(ReservationDetailSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
