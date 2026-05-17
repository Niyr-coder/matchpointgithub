import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { ReservationSchema, WalkinCreateSchema } from "@/lib/schemas/reservations";

registry.registerPath({
  method: "post",
  path: "/api/v1/walkins",
  tags: ["Reservations"],
  summary: "Create a walk-in (employee/manager). Materializes as both a walkin row and a checked_in reservation",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: WalkinCreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(ReservationSchema) } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
    403: { description: "Role required", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Court occupied", content: { "application/json": { schema: ApiErrorSchema } } },
    422: { description: "Missing court / business rule violation", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
