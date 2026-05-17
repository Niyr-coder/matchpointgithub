import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiOkSchema } from "@/lib/schemas/envelope";

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/sign-out",
  tags: ["Auth"],
  summary: "Sign out the current session and clear cookies",
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } },
    },
  },
});

export const _registered = true;
