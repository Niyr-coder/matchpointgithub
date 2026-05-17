import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { ReservationCancelSchema, ReservationSchema } from "@/lib/schemas/reservations";

registry.registerPath({
  method: "post",
  path: "/api/v1/reservations/{id}/cancel",
  tags: ["Reservations"],
  summary: "Cancel a reservation (organizer or club staff)",
  description:
    "Organizers must cancel within the club's `cancellation_window_hours`. Staff can override.",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) }),
    body: { content: { "application/json": { schema: ReservationCancelSchema } } },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(ReservationSchema) } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
    403: { description: "Role required", content: { "application/json": { schema: ApiErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Cannot cancel in current status", content: { "application/json": { schema: ApiErrorSchema } } },
    422: { description: "Outside cancellation window", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
