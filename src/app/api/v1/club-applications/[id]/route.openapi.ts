import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import {
  ClubApplicationDetailSchema,
  ClubApplicationSchema,
  ClubApplicationUpdateSchema,
} from "@/lib/schemas/clubApplications";
import { z } from "zod";

const idParam = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });

registry.registerPath({
  method: "get",
  path: "/api/v1/club-applications/{id}",
  tags: ["ClubApplications"],
  summary: "Get application detail (application + courts + docs + photos + events)",
  security: [{ cookieAuth: [] }],
  request: { params: idParam },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(ClubApplicationDetailSchema) } },
    },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/club-applications/{id}",
  tags: ["ClubApplications"],
  summary: "Autosave a wizard step (discriminated by step)",
  description:
    "Body shape: `{ step: 1|2|3, data: <step-partial> }`. " +
    "Server advances `currentStep` when minimum required fields for the step are present.",
  security: [{ cookieAuth: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: ClubApplicationUpdateSchema } } },
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(ClubApplicationSchema) } },
    },
    400: { description: "Validation failed", content: { "application/json": { schema: ApiErrorSchema } } },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/club-applications/{id}",
  tags: ["ClubApplications"],
  summary: "Withdraw an application (allowed only while draft or submitted)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: z.object({ reason: z.string().max(500).optional() }) } },
    },
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(ClubApplicationSchema) } },
    },
    401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Cannot withdraw in current state", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
