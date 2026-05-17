// Student progress / evaluations / notes.
import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { IsoDateTimeSchema, UuidSchema } from "./common";

extendZodWithOpenApi(z);

export const StudentProgressSchema = z
  .object({
    id: UuidSchema,
    studentId: UuidSchema,
    coachId: UuidSchema,
    skill: z.string(),
    currentLevel: z.number().int().min(1).max(10),
    targetLevel: z.number().int().min(1).max(10).nullable(),
    updatedAt: IsoDateTimeSchema,
  })
  .openapi("StudentProgress");

export const StudentEvaluationSchema = z
  .object({
    id: UuidSchema,
    studentId: UuidSchema,
    coachId: UuidSchema,
    classSessionId: UuidSchema.nullable(),
    scores: z.record(z.string(), z.unknown()),
    summary: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .openapi("StudentEvaluation");

export const StudentSummarySchema = z
  .object({
    studentId: UuidSchema,
    displayName: z.string(),
    avatarUrl: z.string().url().nullable(),
    progress: z.array(StudentProgressSchema),
  })
  .openapi("StudentSummary");

export const ProgressUpdateSchema = z
  .object({
    studentId: UuidSchema,
    skill: z.string().min(1).max(40),
    currentLevel: z.number().int().min(1).max(10),
    targetLevel: z.number().int().min(1).max(10).optional(),
  })
  .openapi("ProgressUpdate");

export const EvaluationCreateSchema = z
  .object({
    studentId: UuidSchema,
    classSessionId: UuidSchema.optional(),
    scores: z.record(z.string(), z.unknown()),
    summary: z.string().max(2000).optional(),
  })
  .openapi("EvaluationCreate");
