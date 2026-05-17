import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import { SessionResponseSchema, SignInSchema } from "@/lib/schemas/identity";

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/sign-in",
  tags: ["Auth"],
  summary: "Sign in with email + password",
  request: {
    body: { content: { "application/json": { schema: SignInSchema } } },
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(SessionResponseSchema) } },
    },
    400: { description: "Validation failed", content: { "application/json": { schema: ApiErrorSchema } } },
    401: { description: "Invalid credentials", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
