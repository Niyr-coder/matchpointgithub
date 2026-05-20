"use server";

// Admin: gobernanza de quedadas — listar/inspeccionar/cancelar + cola de reportes.
// Toda mutación via service-role con setAuditActor (audit con actor=admin).
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

async function requireAdminUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere rol admin");
  return user.id;
}

export type AdminQuedadaRow = {
  id: string;
  title: string;
  creatorId: string;
  format: string;
  visibility: string;
  status: string;
  startsAt: string;
  feeCents: number;
};

export async function listQuedadasAdmin(): Promise<ActionResult<AdminQuedadaRow[]>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    const admin = getAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("quedadas")
      .select("id,title,creator_id,format,visibility,status,starts_at,fee_cents")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new MpError("QUEDADAS.DB_ERROR", error.message, 500);
    return (
      (data ?? []) as Array<Record<string, unknown>>
    ).map((q) => ({
      id: q.id as string,
      title: q.title as string,
      creatorId: q.creator_id as string,
      format: q.format as string,
      visibility: q.visibility as string,
      status: q.status as string,
      startsAt: q.starts_at as string,
      feeCents: q.fee_cents as number,
    }));
  });
}

export async function cancelQuedadaAdmin(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ quedadaId: UuidSchema }), input, async ({ quedadaId }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("quedadas")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", quedadaId);
    if (error) throw new MpError("QUEDADAS.DB_ERROR", error.message, 500);
    return { ok: true as const };
  });
}

export type QuedadaReportRow = {
  id: string;
  quedadaId: string;
  reporterId: string;
  reason: string;
  status: string;
  createdAt: string;
};

export async function listQuedadaReports(): Promise<ActionResult<QuedadaReportRow[]>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    const admin = getAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("quedada_reports")
      .select("id,quedada_id,reporter_id,reason,status,created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new MpError("QUEDADAS.DB_ERROR", error.message, 500);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      quedadaId: r.quedada_id as string,
      reporterId: r.reporter_id as string,
      reason: r.reason as string,
      status: r.status as string,
      createdAt: r.created_at as string,
    }));
  });
}

const ResolveReportSchema = z.object({
  reportId: UuidSchema,
  resolution: z.enum(["resolved", "dismissed"]),
});

export async function resolveQuedadaReport(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ResolveReportSchema, input, async ({ reportId, resolution }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("quedada_reports")
      .update({ status: resolution, resolved_by: adminId })
      .eq("id", reportId);
    if (error) throw new MpError("QUEDADAS.DB_ERROR", error.message, 500);
    return { ok: true as const };
  });
}
