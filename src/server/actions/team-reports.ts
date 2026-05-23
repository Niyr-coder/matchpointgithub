"use server";

// Reportes de teams: cualquier user reporta un team (kinds: name|captain|
// ghost|logo|other). Notif a TODOS los admins. Admin resuelve desde
// AdminUserTeamsScreen — la resolución dispara notif al reporter.
import "server-only";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import {
  TEAM_REPORT_KINDS,
  teamReportKindLabel,
  type TeamReportKind,
} from "@/lib/teams/report-kinds";

type ReportKind = TeamReportKind;

export type AdminTeamReportRow = {
  id: string;
  teamId: string;
  teamName: string;
  teamTag: string;
  kind: ReportKind;
  kindLabel: string;
  detail: string | null;
  status: "open" | "dismissed" | "actioned";
  reporterUserId: string | null;
  reporterName: string | null;
  createdAt: string;
};

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  return user.id;
}

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

// ── reportTeam (cualquier user) ────────────────────────────────────────
const ReportTeamSchema = z.object({
  teamId: UuidSchema,
  kind: z.enum(TEAM_REPORT_KINDS),
  detail: z.string().max(500).optional(),
});

export async function reportTeam(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(ReportTeamSchema, input, async ({ teamId, kind, detail }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    // Anti-spam: máximo 1 reporte abierto del mismo user+team+kind.
    const { data: existing } = await supabase
      .from("team_reports")
      .select("id")
      .eq("team_id", teamId)
      .eq("reporter_user_id", userId)
      .eq("kind", kind)
      .eq("status", "open")
      .maybeSingle();
    if (existing) {
      throw new MpError(
        "TEAMS.REPORT_DUPLICATE",
        "Ya tienes un reporte abierto con este motivo",
        409,
      );
    }
    const { data, error } = await supabase
      .from("team_reports")
      .insert({
        team_id: teamId,
        reporter_user_id: userId,
        kind,
        detail: detail ?? null,
      } as never)
      .select("id")
      .single();
    if (error) throw new MpError("TEAMS.REPORT_FAILED", error.message, 500);

    // Notif a admins. Best-effort.
    try {
      const admin = getAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: team } = await (admin as any)
        .from("teams")
        .select("name")
        .eq("id", teamId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: admins } = await (admin as any)
        .from("role_assignments")
        .select("user_id")
        .eq("role", "admin")
        .is("revoked_at", null);
      const adminIds = Array.from(
        new Set(((admins ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)),
      );
      if (adminIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from("notification_jobs").insert(
          adminIds.map((uid) => ({
            user_id: uid,
            role: "admin",
            kind: "team_reported",
            channel: "inapp",
            payload: {
              team_id: teamId,
              team_name: team?.name ?? "?",
              kind_label: teamReportKindLabel(kind),
              report_id: data.id,
            },
            status: "pending",
          })),
        );
      }
    } catch (e) {
      console.error("[reportTeam] admin notif failed", e);
    }

    return { id: data.id as string };
  });
}

// ── resolveTeamReport (admin only) ─────────────────────────────────────
const ResolveReportSchema = z.object({
  reportId: UuidSchema,
  action: z.enum(["dismissed", "actioned"]),
  resolution: z.string().max(280).optional(),
});

export async function resolveTeamReport(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(ResolveReportSchema, input, async ({ reportId, action, resolution }) => {
    const adminId = await requireAdminUserId();
    const admin = getAdminClient();
    await setAuditActor(admin, adminId, "admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: report } = await (admin as any)
      .from("team_reports")
      .select("id,team_id,reporter_user_id,status,teams(name)")
      .eq("id", reportId)
      .maybeSingle();
    if (!report) throw new MpError("TEAMS.REPORT_NOT_FOUND", "Reporte no encontrado", 404);
    if (report.status !== "open") {
      throw new MpError(
        "TEAMS.REPORT_NOT_OPEN",
        `Ya está resuelto (${report.status})`,
        409,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from("team_reports")
      .update({
        status: action,
        resolved_at: new Date().toISOString(),
        resolved_by: adminId,
        resolution: resolution ?? null,
      })
      .eq("id", reportId);
    if (error) throw new MpError("TEAMS.REPORT_RESOLVE_FAILED", error.message, 500);

    // Notif al reporter (si todavía existe).
    if (report.reporter_user_id) {
      try {
        const teamName =
          (report.teams as { name?: string } | null)?.name ?? "un team";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from("notification_jobs").insert({
          user_id: report.reporter_user_id,
          role: "user",
          kind: "team_report_resolved",
          channel: "inapp",
          payload: {
            team_name: teamName,
            resolution_label:
              action === "actioned" ? "se tomó acción" : "se desestimó",
            resolution: resolution ?? null,
          },
          status: "pending",
        });
      } catch (e) {
        console.error("[resolveTeamReport] notif reporter failed", e);
      }
    }
    revalidatePath("/dashboard/admin/admin-user-teams");
    return { ok: true as const };
  });
}

// ── listTeamReportsAdmin (helper server-side) ──────────────────────────
// Devuelve los reportes abiertos para el banner de moderación del admin.
export async function listOpenTeamReportsServer(
  limit = 10,
): Promise<AdminTeamReportRow[]> {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("team_reports")
    .select(
      "id,team_id,kind,detail,status,reporter_user_id,created_at,teams(name,tag,slug),profiles!team_reports_reporter_user_id_fkey(display_name)",
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[listOpenTeamReportsServer]", error.message);
    return [];
  }
  return (
    (data ?? []) as Array<{
      id: string;
      team_id: string;
      kind: ReportKind;
      detail: string | null;
      status: "open" | "dismissed" | "actioned";
      reporter_user_id: string | null;
      created_at: string;
      teams: { name?: string; tag?: string | null; slug?: string } | null;
      profiles: { display_name?: string } | null;
    }>
  ).map((r) => ({
    id: r.id,
    teamId: r.team_id,
    teamName: r.teams?.name ?? "?",
    teamTag: ((r.teams?.tag ?? r.teams?.slug ?? "TEAM").slice(0, 4) || "TEAM").toUpperCase(),
    kind: r.kind,
    kindLabel: teamReportKindLabel(r.kind),
    detail: r.detail,
    status: r.status,
    reporterUserId: r.reporter_user_id,
    reporterName: r.profiles?.display_name ?? null,
    createdAt: r.created_at,
  }));
}
