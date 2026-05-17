import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import {
  ReservationCreateSchema,
  ReservationListParamsSchema,
  ReservationSchema,
} from "@/lib/schemas/reservations";

registry.registerPath({
  method: "get",
  path: "/api/v1/reservations",
  tags: ["Reservations"],
  summary: "List reservations (RLS-filtered: organizer self, club staff, or public-visibility rows)",
  security: [{ cookieAuth: [] }],
  request: { query: ReservationListParamsSchema },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(ReservationSchema)) } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/reservations",
  tags: ["Reservations"],
  summary: "Create a reservation",
  description: "Anti-double-booking enforced by Postgres EXCLUDE constraint. Supports `Idempotency-Key` header.",
  security: [{ cookieAuth: [] }],
  request: {
    headers: z.object({
      "Idempotency-Key": z.string().uuid().optional(),
    }),
    body: { content: { "application/json": { schema: ReservationCreateSchema } } },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(ReservationSchema) } } },
    400: { description: "Validation failed", content: { "application/json": { schema: ApiErrorSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Slot taken or idempotency-key mismatch", content: { "application/json": { schema: ApiErrorSchema } } },
    422: { description: "Outside reservation window / in past", content: { "application/json": { schema: ApiErrorSchema } } },
    429: { description: "Rate limit exceeded", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
