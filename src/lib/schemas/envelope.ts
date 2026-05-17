// API response envelope schemas (OpenAPI-aware).
// Server Actions return ActionResult<T>; Route Handlers wrap with NextResponse.json.

import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const PageMetaSchema = z
  .object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  })
  .openapi("PageMeta");

export const ApiErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
      requestId: z.string(),
    }),
  })
  .openapi("ApiError");

export const ApiOkSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    ok: z.literal(true),
    data,
    meta: PageMetaSchema.optional(),
  });
