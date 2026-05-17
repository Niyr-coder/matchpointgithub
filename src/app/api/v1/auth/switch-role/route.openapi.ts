import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { SessionResponseSchema, SwitchRoleSchema } from "@/lib/schemas/identity";

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/switch-role",
  tags: ["Auth"],
  summary: "Switch the active role for the current session",
  description:
    "Validates that the user has the requested role assigned (optionally scoped to a club) and updates the `mp_active_role` cookie.",
  security: [{ cookieAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: SwitchRoleSchema } } },
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(SessionResponseSchema) } },
    },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
    403: { description: "Role not granted", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
