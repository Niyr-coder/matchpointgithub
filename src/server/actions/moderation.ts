"use server";

// Moderation: anyone can report, admin acts.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  ActOnReportSchema,
  ReportCreateSchema,
  ReportSchema,
  ReportStatusSchema,
  type Report,
} from "@/lib/schemas/ops";
import { UuidSchema } from "@/lib/schemas/common";

function mapReport(row: Record<string, unknown>): Report {
  return ReportSchema.parse({
    id: row.id,
    reporterId: row.reporter_id,
    entity: row.entity,
    entityId: row.entity_id,
    reason: row.reason,
    details: row.details ?? null,
    status: row.status,
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    resolutionNotes: (row.resolution_notes as string | null) ?? null,
    createdAt: row.created_at,
  });
}

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

async function requireAdmin(): Promise<string> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Admin required");
  return userId;
}

// ── reportContent (any user) ───────────────────────────────────────────
export async function reportContent(input: unknown): Promise<ActionResult<Report>> {
  return runAction(ReportCreateSchema, input, async (data) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("reports")
      .insert({
        reporter_id: userId,
        entity: data.entity,
        entity_id: data.entityId,
        reason: data.reason,
        details: data.details ?? null,
        status: "pending",
      } as never)
      .select()
      .single();
    if (error) throw new MpError("REPORTS.CREATE_FAILED", error.message, 500);
    return mapReport(row);
  });
}

// ── listReports (admin) ────────────────────────────────────────────────
export async function listReports(input: unknown): Promise<ActionResult<Report[]>> {
  return runAction(
    z.object({
      status: ReportStatusSchema.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    input,
    async ({ status, limit }) => {
      await requireAdmin();
      const supabase = await getServerClient();
      let q = supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw new MpError("REPORTS.DB_ERROR", error.message, 500);
      return (data ?? []).map(mapReport);
    },
  );
}

// ── actOnReport (admin) ────────────────────────────────────────────────
const ActInputSchema = z.object({
  id: UuidSchema,
  body: ActOnReportSchema,
});

export async function actOnReport(input: unknown): Promise<ActionResult<Report>> {
  return runAction(ActInputSchema, input, async ({ id, body }) => {
    const adminId = await requireAdmin();
    const supabase = await getServerClient();
    const { data: report } = await supabase
      .from("reports")
      .select("*")
      .eq("id", id)
      .single();
    if (!report) throw new MpError("REPORTS.NOT_FOUND", "Report not found", 404);

    // Log the moderation action.
    await supabase.from("moderation_actions").insert({
      report_id: id,
      target_user_id: null,
      target_entity: report.entity,
      target_entity_id: report.entity_id,
      action: body.action,
      duration_hours: body.durationHours ?? null,
      reason: body.reason,
      performed_by: adminId,
    } as never);

    const { data, error } = await supabase
      .from("reports")
      .update({
        status: body.action === "dismiss" ? "dismissed" : "actioned",
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        resolution_notes: body.reason,
      } as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new MpError("REPORTS.ACT_FAILED", error.message, 500);
    return mapReport(data);
  });
}
