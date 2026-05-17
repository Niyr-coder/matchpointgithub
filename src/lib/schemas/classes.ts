// Class catalog + sessions + enrollments.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  IsoDateTimeSchema,
  MpCurrencySchema,
  MpSkillLevelSchema,
  MpSportSchema,
  UuidSchema,
} from "./common";

extendZodWithOpenApi(z);

export const ClassKindSchema = z
  .enum(["group", "clinic", "camp", "one_on_one", "semi_private"])
  .openapi("ClassKind");

export const ClassSchema = z
  .object({
    id: UuidSchema,
    clubId: UuidSchema,
    coachId: UuidSchema,
    name: z.string(),
    description: z.string().nullable(),
    kind: ClassKindSchema,
    sport: MpSportSchema,
    skillLevel: MpSkillLevelSchema.nullable(),
    maxStudents: z.number().int(),
    priceCents: z.number().int(),
    currency: MpCurrencySchema,
    recurrenceRule: z.string().nullable(),
    active: z.boolean(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("Class");

export const ClassSessionSchema = z
  .object({
    id: UuidSchema,
    classId: UuidSchema,
    courtId: UuidSchema.nullable(),
    startsAt: IsoDateTimeSchema,
    endsAt: IsoDateTimeSchema,
    status: z.enum(["scheduled", "live", "completed", "cancelled"]),
    notes: z.string().nullable(),
  })
  .openapi("ClassSession");

export const ClassEnrollmentSchema = z
  .object({
    id: UuidSchema,
    classId: UuidSchema,
    studentId: UuidSchema,
    status: z.enum(["enrolled", "waitlist", "cancelled", "completed"]),
    enrolledAt: IsoDateTimeSchema,
  })
  .openapi("ClassEnrollment");

export const ClassDetailSchema = z
  .object({
    cls: ClassSchema,
    sessions: z.array(ClassSessionSchema),
    enrolledCount: z.number().int(),
  })
  .openapi("ClassDetail");

export const ClassListParamsSchema = z
  .object({
    clubId: UuidSchema.optional(),
    coachId: UuidSchema.optional(),
    sport: MpSportSchema.optional(),
    activeOnly: z.coerce.boolean().default(true),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
  })
  .openapi("ClassListParams");

export type ClassRow = z.infer<typeof ClassSchema>;
export type ClassDetail = z.infer<typeof ClassDetailSchema>;
export type ClassEnrollment = z.infer<typeof ClassEnrollmentSchema>;
