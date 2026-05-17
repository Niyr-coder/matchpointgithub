import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { SessionResponseSchema, SignUpSchema } from "@/lib/schemas/identity";

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/sign-up",
  tags: ["Auth"],
  summary: "Create a new account",
  description:
    "Creates an auth.users row, fires the auto-profile trigger and sets `mp_active_role=user` cookie.",
  request: {
    body: { content: { "application/json": { schema: SignUpSchema } } },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: ApiOkSchema(SessionResponseSchema) } },
    },
    400: {
      description: "Validation failed",
      content: { "application/json": { schema: ApiErrorSchema } },
    },
    409: {
      description: "Email already registered",
      content: { "application/json": { schema: ApiErrorSchema } },
    },
  },
});

// Force-import keeps tree-shaking from dropping this side-effecting module.
export const _registered = true;
void z;
