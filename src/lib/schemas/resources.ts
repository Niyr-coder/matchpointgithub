// Coach resources library.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, MpSkillLevelSchema, UuidSchema } from "./common";

extendZodWithOpenApi(z);

export const ResourceKindSchema = z
  .enum(["video", "article", "pdf", "plan", "exercise", "link"])
  .openapi("ResourceKind");

export const ResourceVisibilitySchema = z
  .enum(["public", "members", "private"])
  .openapi("ResourceVisibility");

export const ResourceSchema = z
  .object({
    id: UuidSchema,
    coachId: UuidSchema,
    clubId: UuidSchema.nullable(),
    title: z.string(),
    description: z.string().nullable(),
    kind: ResourceKindSchema,
    coverUrl: z.string().url().nullable(),
    durationSeconds: z.number().int().nullable(),
    level: MpSkillLevelSchema.nullable(),
    tags: z.array(z.string()),
    visibility: ResourceVisibilitySchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("Resource");

export const ResourceListParamsSchema = z
  .object({
    coachId: UuidSchema.optional(),
    kind: ResourceKindSchema.optional(),
    tag: z.string().optional(),
    q: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
  })
  .openapi("ResourceListParams");

export const ResourceCreateSchema = z
  .object({
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional(),
    kind: ResourceKindSchema,
    coverUrl: z.string().url().optional(),
    durationSeconds: z.number().int().positive().optional(),
    level: MpSkillLevelSchema.optional(),
    tags: z.array(z.string().max(30)).max(10).default([]),
    visibility: ResourceVisibilitySchema.default("private"),
    clubId: UuidSchema.optional(),
  })
  .openapi("ResourceCreate");

export type Resource = z.infer<typeof ResourceSchema>;
export type ResourceCreate = z.infer<typeof ResourceCreateSchema>;
