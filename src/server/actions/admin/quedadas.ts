"use server";

// Admin: gobernanza de quedadas — listar/inspeccionar/cancelar + cola de reportes.
// Toda mutación via service-role con setAuditActor (audit con actor=admin).
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

export type AdminQuedadaRow = {
  id: string;
  title: string;
  creatorId: string;
  creatorName: string;
  format: string;
  visibility: string;
  status: string;
  startsAt: string;
  maxPlayers: number;
  participantCount: number;
  feeCents: number;
  reportsCount: number;
};

export async function listQuedadasAdmin(): Promise<ActionResult<AdminQuedadaRow[]>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    const admin = getAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("quedadas")
      .select("id,title,creator_id,format,visibility,status,starts_at,max_players,fee_cents")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new MpError("QUEDADAS.DB_ERROR", error.message, 500);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const quedadaIds = rows.map((q) => q.id as string);
    const creatorIds = Array.from(new Set(rows.map((q) => q.creator_id as string).filter(Boolean)));

    const [profilesRes, participantsRes, reportsRes, guestsRes] = await Promise.all([
      creatorIds.length
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (admin as any).from("profiles").select("id,display_name,username").in("id", creatorIds)
        : Promise.resolve({ data: [] }),
      quedadaIds.length
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (admin as any).from("quedada_participants").select("quedada_id,status").in("quedada_id", quedadaIds)
        : Promise.resolve({ data: [] }),
      quedadaIds.length
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (admin as any).from("quedada_reports").select("quedada_id,status").in("quedada_id", quedadaIds)
        : Promise.resolve({ data: [] }),
      quedadaIds.length
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (admin as any).from("quedada_guests").select("quedada_id").in("quedada_id", quedadaIds)
        : Promise.resolve({ data: [] }),
    ]);

    const names = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as Array<Record<string, unknown>>) {
      names.set(
        p.id as string,
        ((p.display_name as string | null) || (p.username as string | null) || "Usuario") as string,
      );
    }

    const participantCounts = new Map<string, number>();
    for (const p of (participantsRes.data ?? []) as Array<Record<string, unknown>>) {
      if (p.status && !["cancelled", "left"].includes(p.status as string)) {
        const quedadaId = p.quedada_id as string;
        participantCounts.set(quedadaId, (participantCounts.get(quedadaId) ?? 0) + 1);
      }
    }
    // Walk-ins (guests) también cuentan como inscritos, igual que en la app.
    for (const g of (guestsRes.data ?? []) as Array<Record<string, unknown>>) {
      const quedadaId = g.quedada_id as string;
      participantCounts.set(quedadaId, (participantCounts.get(quedadaId) ?? 0) + 1);
    }

    const reportCounts = new Map<string, number>();
    for (const r of (reportsRes.data ?? []) as Array<Record<string, unknown>>) {
      if ((r.status as string | null) === "open") {
        const quedadaId = r.quedada_id as string;
        reportCounts.set(quedadaId, (reportCounts.get(quedadaId) ?? 0) + 1);
      }
    }

    return rows.map((q) => ({
      id: q.id as string,
      title: q.title as string,
      creatorId: q.creator_id as string,
      creatorName: names.get(q.creator_id as string) ?? "Usuario",
      format: q.format as string,
      visibility: q.visibility as string,
      status: q.status as string,
      startsAt: q.starts_at as string,
      maxPlayers: (q.max_players as number | null) ?? 0,
      participantCount: participantCounts.get(q.id as string) ?? 0,
      feeCents: q.fee_cents as number,
      reportsCount: reportCounts.get(q.id as string) ?? 0,
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

export async function kickQuedadaParticipantAdmin(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({ quedadaId: UuidSchema, userId: UuidSchema }),
    input,
    async ({ quedadaId, userId }) => {
      const adminId = await requireAdminUserId();
      const admin = getAdminClient();
      await setAuditActor(admin, adminId, "admin");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: participant, error: getErr } = await (admin as any)
        .from("quedada_participants")
        .select("user_id,status")
        .eq("quedada_id", quedadaId)
        .eq("user_id", userId)
        .maybeSingle();
      if (getErr) throw new MpError("QUEDADAS.DB_ERROR", getErr.message, 500);
      if (!participant) {
        throw new MpError("QUEDADAS.PARTICIPANT_NOT_FOUND", "Participante no encontrado", 404);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin as any)
        .from("quedada_participants")
        .update({ status: "cancelled" })
        .eq("quedada_id", quedadaId)
        .eq("user_id", userId);
      if (error) throw new MpError("QUEDADAS.DB_ERROR", error.message, 500);

      await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any)
          .from("quedada_pairs")
          .update({ player_a_id: null })
          .eq("quedada_id", quedadaId)
          .eq("player_a_id", userId),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any)
          .from("quedada_pairs")
          .update({ player_b_id: null })
          .eq("quedada_id", quedadaId)
          .eq("player_b_id", userId),
      ]);

      return { ok: true as const };
    },
  );
}

export type QuedadaReportRow = {
  id: string;
  quedadaId: string;
  quedadaTitle: string;
  reporterId: string;
  reporterName: string;
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

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const quedadaIds = Array.from(new Set(rows.map((r) => r.quedada_id as string).filter(Boolean)));
    const reporterIds = Array.from(new Set(rows.map((r) => r.reporter_id as string).filter(Boolean)));
    const [quedadasRes, profilesRes] = await Promise.all([
      quedadaIds.length
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (admin as any).from("quedadas").select("id,title").in("id", quedadaIds)
        : Promise.resolve({ data: [] }),
      reporterIds.length
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (admin as any).from("profiles").select("id,display_name,username").in("id", reporterIds)
        : Promise.resolve({ data: [] }),
    ]);

    const quedadaTitles = new Map<string, string>();
    for (const q of (quedadasRes.data ?? []) as Array<Record<string, unknown>>) {
      quedadaTitles.set(q.id as string, (q.title as string | null) ?? "Quedada");
    }
    const reporterNames = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as Array<Record<string, unknown>>) {
      reporterNames.set(
        p.id as string,
        ((p.display_name as string | null) || (p.username as string | null) || "Usuario") as string,
      );
    }

    return rows.map((r) => ({
      id: r.id as string,
      quedadaId: r.quedada_id as string,
      quedadaTitle: quedadaTitles.get(r.quedada_id as string) ?? "Quedada",
      reporterId: r.reporter_id as string,
      reporterName: reporterNames.get(r.reporter_id as string) ?? "Usuario",
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
