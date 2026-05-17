// Consolidated OpenAPI registration for the coach-domain endpoints.
// Single file to keep paths.ts small.
import { z } from "zod";
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import {
  CoachDetailSchema,
  CoachListParamsSchema,
  CoachProfileSchema,
} from "@/lib/schemas/coaches";
import {
  ClassDetailSchema,
  ClassEnrollmentSchema,
  ClassListParamsSchema,
  ClassSchema,
} from "@/lib/schemas/classes";
import { MpSportSchema } from "@/lib/schemas/common";
import {
  EvaluationCreateSchema,
  ProgressUpdateSchema,
  StudentEvaluationSchema,
  StudentProgressSchema,
  StudentSummarySchema,
} from "@/lib/schemas/students";
import {
  ResourceCreateSchema,
  ResourceListParamsSchema,
  ResourceSchema,
} from "@/lib/schemas/resources";
import { UuidSchema } from "@/lib/schemas/common";

const idPath = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });
const err = { 401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } } };

// ── coaches ────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/coaches",
  tags: ["Coaches"],
  summary: "List coach profiles (public)",
  request: { query: CoachListParamsSchema },
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(CoachProfileSchema)) } } } },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/coaches/{id}",
  tags: ["Coaches"],
  summary: "Coach detail: profile + specialties + availability + certs + reviews + clubIds",
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(CoachDetailSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "patch",
  path: "/api/v1/coaches/profile",
  tags: ["Coaches"],
  summary: "Actualizar el perfil del coach autenticado",
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            headline: z.string().max(160).optional(),
            bio: z.string().max(2000).optional(),
            yearsExperience: z.number().int().min(0).max(80).optional(),
            hourlyRateCents: z.number().int().min(0).optional(),
            currency: z.string().optional(),
            introVideoUrl: z.string().url().optional(),
            primarySport: MpSportSchema.optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "Actualizado", content: { "application/json": { schema: ApiOkSchema(CoachProfileSchema) } } },
    ...err,
  },
});

// ── classes ────────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/classes",
  tags: ["Classes"],
  summary: "List classes (public). Filters: clubId, coachId, sport, activeOnly",
  request: { query: ClassListParamsSchema },
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(ClassSchema)) } } } },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/classes",
  tags: ["Classes"],
  summary: "Crear una clase (coach asignado al club)",
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            clubId: UuidSchema,
            name: z.string().min(2).max(120),
            description: z.string().max(1000).optional(),
            kind: z.enum(["group", "clinic", "camp", "one_on_one", "semi_private"]),
            sport: MpSportSchema,
            skillLevel: z.string().optional(),
            maxStudents: z.number().int().positive().optional(),
            priceCents: z.number().int().min(0).optional(),
            currency: z.string().optional(),
            recurrenceRule: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(ClassSchema) } } },
    ...err,
    403: { description: "Coach not active at this club", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/classes/sessions/{id}/attendance",
  tags: ["Classes"],
  summary: "Marcar asistencia de un alumno en una sesión (coach dueño de la clase)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            studentId: UuidSchema,
            attended: z.boolean(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    ...err,
    403: { description: "Solo el coach de la clase puede marcar asistencia", content: { "application/json": { schema: ApiErrorSchema } } },
    404: { description: "Sesión no encontrada", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

// ── walkins · check-ins ────────────────────────────────────────────────
registry.registerPath({
  method: "delete",
  path: "/api/v1/walkins/{id}",
  tags: ["Walkins"],
  summary: "Eliminar un walk-in de la cola (employee/manager). Requiere clubId en query",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    query: z.object({ clubId: UuidSchema.openapi({ param: { name: "clubId", in: "query" } }) }),
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } } },
    ...err,
    403: { description: "Club staff requerido", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/check-ins",
  tags: ["Walkins"],
  summary: "Registrar un check-in para una reserva o sesión de clase (club staff)",
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            clubId: UuidSchema,
            reservationId: UuidSchema.optional(),
            classSessionId: UuidSchema.optional(),
            userId: UuidSchema.optional(),
            method: z.enum(["qr", "manual", "auto"]).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(z.object({ id: UuidSchema })) } } },
    ...err,
    403: { description: "Club staff requerido", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/classes/{id}",
  tags: ["Classes"],
  summary: "Class detail with upcoming sessions and enrolled count",
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(ClassDetailSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/classes/{id}/enroll",
  tags: ["Classes"],
  summary: "Enroll in a class (self or coach-on-behalf). Falls to waitlist if full",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: { content: { "application/json": { schema: z.object({ studentId: UuidSchema.optional() }) } } },
  },
  responses: {
    201: { description: "Enrolled (status may be 'waitlist')", content: { "application/json": { schema: ApiOkSchema(ClassEnrollmentSchema) } } },
    ...err,
    403: { description: "Cannot enroll someone else", content: { "application/json": { schema: ApiErrorSchema } } },
    409: { description: "Already enrolled", content: { "application/json": { schema: ApiErrorSchema } } },
    422: { description: "Class inactive", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/classes/enrollments/{id}/cancel",
  tags: ["Classes"],
  summary: "Cancel one of my class enrollments",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: { description: "Cancelled", content: { "application/json": { schema: ApiOkSchema(ClassEnrollmentSchema) } } },
    ...err,
    409: { description: "Not cancellable", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/me/classes",
  tags: ["Classes"],
  summary: "Current user's class enrollments",
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(ClassEnrollmentSchema)) } } },
    ...err,
  },
});

// ── students ───────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/coaches/me/students",
  tags: ["Students"],
  summary: "Students of the current coach with their progress",
  security: [{ cookieAuth: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(StudentSummarySchema)) } } },
    ...err,
    403: { description: "Coach profile required", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "put",
  path: "/api/v1/students/progress",
  tags: ["Students"],
  summary: "Upsert progress for a (student, skill) by current coach",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: ProgressUpdateSchema } } } },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(StudentProgressSchema) } } },
    ...err,
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/students/evaluations",
  tags: ["Students"],
  summary: "Add an evaluation for a student",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: EvaluationCreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(StudentEvaluationSchema) } } },
    ...err,
  },
});

// ── resources ──────────────────────────────────────────────────────────
registry.registerPath({
  method: "get",
  path: "/api/v1/resources",
  tags: ["Resources"],
  summary: "List resources (RLS-filtered: own + granted + public)",
  request: { query: ResourceListParamsSchema },
  responses: { 200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(z.array(ResourceSchema)) } } } },
});
registry.registerPath({
  method: "get",
  path: "/api/v1/resources/{id}",
  tags: ["Resources"],
  summary: "Get a resource",
  request: { params: idPath },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: ApiOkSchema(ResourceSchema) } } },
    404: { description: "Not found", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});
registry.registerPath({
  method: "post",
  path: "/api/v1/resources",
  tags: ["Resources"],
  summary: "Create a resource (coach)",
  security: [{ cookieAuth: [] }],
  request: { body: { content: { "application/json": { schema: ResourceCreateSchema } } } },
  responses: {
    201: { description: "Created", content: { "application/json": { schema: ApiOkSchema(ResourceSchema) } } },
    ...err,
    403: { description: "Coach profile required", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

export const _registered = true;
