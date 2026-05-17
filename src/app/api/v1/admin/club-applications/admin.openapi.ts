// Consolidated OpenAPI registration for admin club-application transitions.
// One file for the whole admin namespace since every endpoint is a tiny variant.
import { registry } from "@/lib/api/openapi/registry";
import { ApiErrorSchema, ApiOkSchema } from "@/lib/schemas/envelope";
import {
  ClubApplicationSchema,
  ClubDocStatusSchema,
} from "@/lib/schemas/clubApplications";
import { z } from "zod";

const idPath = z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) });
const docIdPath = z.object({
  id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
  docId: z.string().uuid().openapi({ param: { name: "docId", in: "path" } }),
});

registry.registerPath({
  method: "get",
  path: "/api/v1/admin/club-applications",
  tags: ["ClubApplications"],
  summary: "List applications (admin queue)",
  security: [{ cookieAuth: [] }],
  request: {
    query: z.object({
      status: z
        .enum([
          "draft",
          "submitted",
          "docs_review",
          "field_verification",
          "final_review",
          "approved",
          "rejected",
          "withdrawn",
        ])
        .optional(),
      q: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }),
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(z.array(ClubApplicationSchema)) } },
    },
    403: { description: "Admin role required", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

// Status transitions — all share the same request/response shape.
const okApp = { description: "OK", content: { "application/json": { schema: ApiOkSchema(ClubApplicationSchema) } } };
const errs = {
  401: { description: "Not authenticated", content: { "application/json": { schema: ApiErrorSchema } } },
  403: { description: "Admin role required", content: { "application/json": { schema: ApiErrorSchema } } },
  404: { description: "Application not found", content: { "application/json": { schema: ApiErrorSchema } } },
  409: { description: "Transition not allowed in current state", content: { "application/json": { schema: ApiErrorSchema } } },
};

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/club-applications/{id}/transitions/docs-review",
  tags: ["ClubApplications"],
  summary: "submitted → docs_review",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: { 200: okApp, ...errs },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/club-applications/{id}/transitions/field-verification",
  tags: ["ClubApplications"],
  summary: "docs_review → field_verification (schedule)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            scheduledAt: z.string().datetime({ offset: true }),
            notes: z.string().max(500).optional(),
          }),
        },
      },
    },
  },
  responses: { 200: okApp, ...errs },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/club-applications/{id}/transitions/field-verified",
  tags: ["ClubApplications"],
  summary: "Mark field verification completed (status stays field_verification)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: {
      content: {
        "application/json": {
          schema: z.object({ notes: z.string().max(500).optional() }),
        },
      },
    },
  },
  responses: { 200: okApp, ...errs },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/club-applications/{id}/transitions/final-review",
  tags: ["ClubApplications"],
  summary: "field_verification → final_review",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: { 200: okApp, ...errs },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/club-applications/{id}/transitions/approve",
  tags: ["ClubApplications"],
  summary: "final_review → approved (materializes club + assigns owner role)",
  description:
    "Calls `fn_materialize_club_from_application` which atomically creates the club, " +
    "settings, courts, photos and the `owner` role assignment.",
  security: [{ cookieAuth: [] }],
  request: { params: idPath },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: ApiOkSchema(
            z.object({ application: ClubApplicationSchema, clubId: z.string().uuid() }),
          ),
        },
      },
    },
    ...errs,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/club-applications/{id}/transitions/reject",
  tags: ["ClubApplications"],
  summary: "Reject from any non-terminal status",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: {
      content: {
        "application/json": {
          schema: z.object({ reason: z.string().min(2).max(1000) }),
        },
      },
    },
  },
  responses: { 200: okApp, ...errs },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/club-applications/{id}/notes",
  tags: ["ClubApplications"],
  summary: "Add a reviewer note (logs a note_added event)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: {
      content: {
        "application/json": { schema: z.object({ note: z.string().min(1).max(2000) }) },
      },
    },
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) },
      },
    },
    ...errs,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/club-applications/{id}/documents/{docId}/approve",
  tags: ["ClubApplications"],
  summary: "Approve a submitted document",
  security: [{ cookieAuth: [] }],
  request: { params: docIdPath },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: ApiOkSchema(z.object({ id: z.string().uuid(), status: ClubDocStatusSchema })),
        },
      },
    },
    ...errs,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/admin/club-applications/{id}/documents/{docId}/reject",
  tags: ["ClubApplications"],
  summary: "Reject a submitted document with a reason",
  security: [{ cookieAuth: [] }],
  request: {
    params: docIdPath,
    body: {
      content: {
        "application/json": { schema: z.object({ reason: z.string().min(2).max(500) }) },
      },
    },
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: ApiOkSchema(z.object({ id: z.string().uuid(), status: ClubDocStatusSchema })),
        },
      },
    },
    ...errs,
  },
});

// ── Upload openapi (kept here so we don't sprinkle 4 tiny files) ───────
registry.registerPath({
  method: "post",
  path: "/api/v1/club-applications/{id}/documents",
  tags: ["ClubApplications"],
  summary: "Upload a required document (multipart)",
  description: "Body: multipart/form-data with `file` (Blob) and `kind` (ClubDocKind).",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.string().openapi({ format: "binary" }),
            kind: z.string(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Uploaded", content: { "application/json": { schema: ApiOkSchema(z.unknown()) } } },
    422: { description: "Invalid file / business rule", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/club-applications/{id}/documents/{docId}",
  tags: ["ClubApplications"],
  summary: "Delete an uploaded document",
  security: [{ cookieAuth: [] }],
  request: { params: docIdPath },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/club-applications/{id}/photos",
  tags: ["ClubApplications"],
  summary: "Upload a gallery photo (multipart, max 6 per application)",
  security: [{ cookieAuth: [] }],
  request: {
    params: idPath,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.string().openapi({ format: "binary" }),
            caption: z.string().optional(),
            ordinal: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: "Uploaded", content: { "application/json": { schema: ApiOkSchema(z.unknown()) } } },
    422: { description: "Limit reached / invalid file", content: { "application/json": { schema: ApiErrorSchema } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/club-applications/{id}/photos/{photoId}",
  tags: ["ClubApplications"],
  summary: "Delete a gallery photo",
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
      photoId: z.string().uuid().openapi({ param: { name: "photoId", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ApiOkSchema(z.object({ ok: z.literal(true) })) } },
    },
  },
});

export const _registered = true;
