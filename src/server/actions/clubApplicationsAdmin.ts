"use server";

// Admin Server Actions for the club-applications review pipeline.
// Each transition validates the current status and writes a timeline event.
// `approveApplication` calls fn_materialize_club_from_application which creates
// the real club + courts + photos + role assignment in one transaction.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import {
  ClubApplicationSchema,
  type ClubApplication,
} from "@/lib/schemas/clubApplications";
import { notify } from "@/server/notifications/dispatch";

// Re-use the mapper without exporting it from the user-facing actions file.
function mapApplication(row: Record<string, unknown>): ClubApplication {
  return ClubApplicationSchema.parse({
    id: row.id,
    code: row.code,
    applicantId: row.applicant_id,
    status: row.status,
    currentStep: row.current_step,
    name: row.name ?? null,
    orgType: row.org_type ?? null,
    sports: row.sports ?? [],
    shortDescription: row.short_description ?? null,
    legalName: row.legal_name ?? null,
    taxId: row.tax_id ?? null,
    foundedYear: row.founded_year ?? null,
    contactPerson: row.contact_person ?? null,
    contactEmail: row.contact_email ?? null,
    contactPhone: row.contact_phone ?? null,
    websiteOrSocial: row.website_or_social ?? null,
    address: row.address ?? null,
    district: row.district ?? null,
    province: row.province ?? null,
    country: row.country ?? null,
    referenceNote: row.reference_note ?? null,
    parking: row.parking ?? null,
    geoLat: row.geo_lat !== null && row.geo_lat !== undefined ? Number(row.geo_lat) : null,
    geoLng: row.geo_lng !== null && row.geo_lng !== undefined ? Number(row.geo_lng) : null,
    locationVerifiedAt: row.location_verified_at ?? null,
    weeklyHours: (row.weekly_hours as Record<string, unknown>) ?? {},
    cancellationPolicy: row.cancellation_policy ?? "flexible_24h",
    termsAcceptedAt: row.terms_accepted_at ?? null,
    commissionPct:
      row.commission_pct !== null && row.commission_pct !== undefined
        ? Number(row.commission_pct)
        : 10,
    currency: row.currency ?? null,
    submittedAt: row.submitted_at ?? null,
    reviewerId: row.reviewer_id ?? null,
    reviewStartedAt: row.review_started_at ?? null,
    approvedAt: row.approved_at ?? null,
    rejectedAt: row.rejected_at ?? null,
    rejectionReason: row.rejection_reason ?? null,
    reviewerNotes: row.reviewer_notes ?? null,
    resultingClubId: row.resulting_club_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

const STATUS_LABEL_ES: Record<ClubApplication["status"], string> = {
  draft: "borrador",
  submitted: "enviada",
  docs_review: "revisión documental",
  field_verification: "verificación en sitio",
  final_review: "revisión final",
  approved: "aprobada",
  rejected: "rechazada",
  withdrawn: "retirada",
};

async function requireAdmin(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");

  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  if (!roles?.some((r) => r.role === "admin")) {
    throw new AuthError("AUTH.ROLE_REQUIRED", "Admin role required");
  }
  return user.id;
}

async function transitionStatus({
  applicationId,
  from,
  to,
  extraPayload,
  eventPayload,
  eventKind,
}: {
  applicationId: string;
  from: ClubApplication["status"][];
  to: ClubApplication["status"];
  extraPayload?: Record<string, unknown>;
  eventPayload?: Record<string, unknown>;
  eventKind:
    | "docs_review_started"
    | "field_scheduled"
    | "field_completed"
    | "final_review_started"
    | "approved"
    | "rejected"
    | "note_added";
}): Promise<ClubApplication> {
  const userId = await requireAdmin();
  const supabase = await getServerClient();

  const { data: current, error: getErr } = await supabase
    .from("club_applications")
    .select("status")
    .eq("id", applicationId)
    .single();
  if (getErr || !current) throw new MpError("CLUB_APP.NOT_FOUND", "Application not found", 404);
  if (!from.includes(current.status as ClubApplication["status"])) {
    throw new MpError(
      "CLUB_APP.TRANSITION_FORBIDDEN",
      `Cannot move from '${current.status}' to '${to}'`,
      409,
    );
  }

  const updates: Record<string, unknown> = { status: to, ...(extraPayload ?? {}) };
  if (to === "docs_review" || to === "final_review") {
    updates.review_started_at = new Date().toISOString();
    updates.reviewer_id = userId;
  }
  if (to === "rejected") updates.rejected_at = new Date().toISOString();

  const admin = getAdminClient();
  await setAuditActor(admin, userId, "admin");
  const { data, error } = await admin
    .from("club_applications")
    .update(updates as never)
    .eq("id", applicationId)
    .select()
    .single();
  if (error) throw new MpError("CLUB_APP.UPDATE_FAILED", error.message, 500);

  await admin.from("club_application_events").insert({
    application_id: applicationId,
    kind: eventKind,
    actor_id: userId,
    actor_role: "admin",
    payload: (eventPayload ?? extraPayload ?? {}) as never,
  });

  const application = mapApplication(data);
  const statusLabel = STATUS_LABEL_ES[to];
  if (statusLabel && eventKind !== "note_added") {
    await notify({
      userId: application.applicantId,
      role: "user",
      kind: "club_application_status",
      title: "Tu solicitud cambió de estado",
      body: `Tu solicitud de club pasó a ${statusLabel}.`,
      payload: { applicationId, status: to },
    });
  }

  return application;
}

// ── docs_review ─────────────────────────────────────────────────────────
const IdInput = z.object({ applicationId: UuidSchema });

export async function startDocsReview(input: unknown): Promise<ActionResult<ClubApplication>> {
  return runAction(IdInput, input, async ({ applicationId }) =>
    transitionStatus({
      applicationId,
      from: ["submitted"],
      to: "docs_review",
      eventKind: "docs_review_started",
    }),
  );
}

// ── field_verification ─────────────────────────────────────────────────
const ScheduleFieldSchema = z.object({
  applicationId: UuidSchema,
  scheduledAt: z.string().datetime({ offset: true }),
  notes: z.string().max(500).optional(),
});

export async function scheduleFieldVerification(
  input: unknown,
): Promise<ActionResult<ClubApplication>> {
  return runAction(ScheduleFieldSchema, input, async ({ applicationId, scheduledAt, notes }) =>
    transitionStatus({
      applicationId,
      from: ["docs_review"],
      to: "field_verification",
      eventPayload: { scheduled_at: scheduledAt, notes: notes ?? null },
      eventKind: "field_scheduled",
    }),
  );
}

const MarkFieldVerifiedSchema = z.object({
  applicationId: UuidSchema,
  notes: z.string().max(500).optional(),
});

export async function markFieldVerified(input: unknown): Promise<ActionResult<ClubApplication>> {
  return runAction(MarkFieldVerifiedSchema, input, async ({ applicationId, notes }) => {
    const userId = await requireAdmin();
    const supabase = await getServerClient();

    const { data: current } = await supabase
      .from("club_applications")
      .select("status,location_verified_at")
      .eq("id", applicationId)
      .single();
    if (!current) throw new MpError("CLUB_APP.NOT_FOUND", "Application not found", 404);
    if (current.status !== "field_verification") {
      throw new MpError(
        "CLUB_APP.TRANSITION_FORBIDDEN",
        `Status must be 'field_verification', is '${current.status}'`,
        409,
      );
    }

    const admin = getAdminClient();
    await setAuditActor(admin, userId, "admin");
    const { data, error } = await admin
      .from("club_applications")
      .update({
        location_verified_at: new Date().toISOString(),
        location_verified_by: userId,
      })
      .eq("id", applicationId)
      .select()
      .single();
    if (error) throw new MpError("CLUB_APP.UPDATE_FAILED", error.message, 500);

    await admin.from("club_application_events").insert({
      application_id: applicationId,
      kind: "field_completed",
      actor_id: userId,
      actor_role: "admin",
      note: notes ?? null,
    });

    return mapApplication(data);
  });
}

// ── final_review ────────────────────────────────────────────────────────
export async function startFinalReview(input: unknown): Promise<ActionResult<ClubApplication>> {
  return runAction(IdInput, input, async ({ applicationId }) =>
    transitionStatus({
      applicationId,
      from: ["field_verification"],
      to: "final_review",
      eventKind: "final_review_started",
    }),
  );
}

// ── quickApprove (camino corto: avanza por las etapas faltantes y aprueba) ─
// Para uso desde el panel de admin cuando la revisión por etapas no aporta
// valor (ej. mientras la cola es chica). Atomiza: docs_review → field_verification
// → marca verificado → final_review → approve.
export async function quickApproveApplication(
  input: unknown,
): Promise<ActionResult<{ application: ClubApplication; clubId: string }>> {
  return runAction(IdInput, input, async ({ applicationId }) => {
    const userId = await requireAdmin();
    const supabase = await getServerClient();
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "admin");

    const { data: current } = await supabase
      .from("club_applications")
      .select("status")
      .eq("id", applicationId)
      .single();
    if (!current) throw new MpError("CLUB_APP.NOT_FOUND", "Application not found", 404);

    let status = current.status as string;
    const advance = async (
      toStatus: string,
      eventKind: string,
      extra?: Record<string, unknown>,
    ) => {
      const { error } = await admin
        .from("club_applications")
        .update({ status: toStatus, ...(extra ?? {}) } as never)
        .eq("id", applicationId);
      if (error) throw new MpError("CLUB_APP.UPDATE_FAILED", error.message, 500);
      await admin.from("club_application_events").insert({
        application_id: applicationId,
        kind: eventKind,
        actor_id: userId,
        actor_role: "admin",
      } as never);
      status = toStatus;
    };

    if (status === "submitted") await advance("docs_review", "docs_review_started");
    if (status === "docs_review") await advance("field_verification", "field_scheduled");
    if (status === "field_verification") {
      await admin
        .from("club_applications")
        .update({
          location_verified_at: new Date().toISOString(),
          location_verified_by: userId,
        } as never)
        .eq("id", applicationId);
      await advance("final_review", "final_review_started");
    }
    if (status !== "final_review") {
      throw new MpError(
        "CLUB_APP.TRANSITION_FORBIDDEN",
        `Cannot quick-approve from status '${status}'`,
        409,
      );
    }

    const { data: clubIdRaw, error: matErr } = await admin.rpc(
      "fn_materialize_club_from_application",
      { p_app_id: applicationId },
    );
    if (matErr) throw new MpError("CLUB_APP.APPROVE_FAILED", matErr.message, 500);
    const clubId = String(clubIdRaw);

    const { data: app, error: getErr } = await admin
      .from("club_applications")
      .select("*")
      .eq("id", applicationId)
      .single();
    if (getErr || !app) throw new MpError("CLUB_APP.NOT_FOUND", "Application not found", 404);

    const applicantId = app.applicant_id as string;
    const clubName = app.name as string | null;
    await notify({
      userId: applicantId,
      role: "user",
      kind: "club_application_approved",
      title: "Tu solicitud de club fue aprobada",
      body: clubName ? `${clubName} ya está activo en MATCHPOINT.` : null,
      payload: { applicationId, clubId },
    });
    // Bienvenida al inbox del rol owner: se ve cuando el user entra al portal.
    await notify({
      userId: applicantId,
      role: "owner",
      kind: "welcome_owner",
      title: clubName ? `¡Bienvenido, dueño de ${clubName}!` : "¡Bienvenido al portal del club!",
      body: "Tu portal ya está listo. Configura horarios, sube tarifas y abre las reservas a tu comunidad.",
      payload: { clubId },
    });

    return { application: mapApplication(app), clubId };
  });
}

// ── approve (materializes club) ────────────────────────────────────────
export async function approveApplication(
  input: unknown,
): Promise<ActionResult<{ application: ClubApplication; clubId: string }>> {
  return runAction(IdInput, input, async ({ applicationId }) => {
    const userId = await requireAdmin();
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "admin");

    const { data: clubIdRaw, error } = await admin.rpc(
      "fn_materialize_club_from_application",
      { p_app_id: applicationId },
    );
    if (error) {
      // Map common shape from Postgres exception messages.
      if (error.message.includes("must be in final_review")) {
        throw new MpError(
          "CLUB_APP.TRANSITION_FORBIDDEN",
          "Application must be in final_review to approve",
          409,
        );
      }
      throw new MpError("CLUB_APP.APPROVE_FAILED", error.message, 500);
    }

    const clubId = String(clubIdRaw);
    const { data: app, error: getErr } = await admin
      .from("club_applications")
      .select("*")
      .eq("id", applicationId)
      .single();
    if (getErr || !app) throw new MpError("CLUB_APP.NOT_FOUND", "Application not found", 404);

    await notify({
      userId: app.applicant_id as string,
      role: "user",
      kind: "club_application_approved",
      title: "Tu solicitud de club fue aprobada",
      body: app.name ? `${app.name} ya está activo en MATCHPOINT.` : null,
      payload: { applicationId, clubId },
    });

    return { application: mapApplication(app), clubId };
  });
}

// ── reject ──────────────────────────────────────────────────────────────
const RejectSchema = z.object({
  applicationId: UuidSchema,
  reason: z.string().min(2).max(1000),
});

export async function rejectApplication(input: unknown): Promise<ActionResult<ClubApplication>> {
  return runAction(RejectSchema, input, async ({ applicationId, reason }) => {
    const result = await transitionStatus({
      applicationId,
      from: ["submitted", "docs_review", "field_verification", "final_review"],
      to: "rejected",
      extraPayload: { rejection_reason: reason },
      eventKind: "rejected",
    });
    await notify({
      userId: result.applicantId,
      role: "user",
      kind: "club_application_rejected",
      title: "Tu solicitud de club fue rechazada",
      body: reason,
      payload: { applicationId },
    });
    return result;
  });
}

// ── note ────────────────────────────────────────────────────────────────
const NoteSchema = z.object({
  applicationId: UuidSchema,
  note: z.string().min(1).max(2000),
});

export async function addReviewerNote(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(NoteSchema, input, async ({ applicationId, note }) => {
    const userId = await requireAdmin();
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "admin");
    const { error } = await admin.from("club_application_events").insert({
      application_id: applicationId,
      kind: "note_added",
      actor_id: userId,
      actor_role: "admin",
      note,
    });
    if (error) throw new MpError("CLUB_APP.NOTE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── per-document review ────────────────────────────────────────────────
const DocApproveSchema = z.object({ documentId: UuidSchema });
const DocRejectSchema = z.object({
  documentId: UuidSchema,
  reason: z.string().min(2).max(500),
});

export async function approveApplicationDocument(
  input: unknown,
): Promise<ActionResult<{ id: string; status: "approved" }>> {
  return runAction(DocApproveSchema, input, async ({ documentId }) => {
    const userId = await requireAdmin();
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "admin");
    const { data, error } = await admin
      .from("club_application_documents")
      .update({
        status: "approved",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", documentId)
      .select("id,status")
      .single();
    if (error || !data)
      throw new MpError("CLUB_APP.DOC_NOT_FOUND", "Document not found", 404);
    return { id: data.id as string, status: "approved" as const };
  });
}

export async function rejectApplicationDocument(
  input: unknown,
): Promise<ActionResult<{ id: string; status: "rejected" }>> {
  return runAction(DocRejectSchema, input, async ({ documentId, reason }) => {
    const userId = await requireAdmin();
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "admin");
    const { data, error } = await admin
      .from("club_application_documents")
      .update({
        status: "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq("id", documentId)
      .select("id,status")
      .single();
    if (error || !data)
      throw new MpError("CLUB_APP.DOC_NOT_FOUND", "Document not found", 404);
    return { id: data.id as string, status: "rejected" as const };
  });
}

// ── list (admin queue) ─────────────────────────────────────────────────
const ListQuerySchema = z.object({
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
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function listApplications(
  input: unknown,
): Promise<ActionResult<ClubApplication[]>> {
  return runAction(ListQuerySchema, input, async ({ status, q, limit }) => {
    await requireAdmin();
    const supabase = await getServerClient();
    let query = supabase
      .from("club_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);
    if (q) query = query.ilike("name", `%${q}%`);
    const { data, error } = await query;
    if (error) throw new MpError("CLUB_APP.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapApplication);
  });
}
