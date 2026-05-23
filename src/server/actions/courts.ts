"use server";

// Court CRUD for club staff. Reads are public; writes require owner/manager.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  BulkCourtMaintenanceSchema,
  CourtBlockerSchema,
  CourtCreateSchema,
  CourtMaintenanceSchema,
  CourtSchema,
  CourtUpdateSchema,
  type Court,
} from "@/lib/schemas/courts";
import { UuidSchema } from "@/lib/schemas/common";

function mapCourt(row: Record<string, unknown>): Court {
  return CourtSchema.parse({
    id: row.id,
    clubId: row.club_id,
    code: row.code,
    name: row.name ?? null,
    sport: row.sport,
    surface: row.surface ?? null,
    indoor: row.indoor,
    lights: row.lights,
    active: row.active,
    ordinal: row.ordinal,
    surfaceColor: (row.surface_color as string) ?? "#10b981",
    linesColor: (row.lines_color as string) ?? "#ffffff",
    lineStyle: (row.line_style as string) ?? "classic",
    strokeWidth: (row.stroke_width as number) ?? 3,
    maintenanceReason: (row.maintenance_reason as string | null) ?? null,
    maintenanceUntil: (row.maintenance_until as string | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

async function requireClubStaff(clubId: string): Promise<void> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", userId)
    .is("revoked_at", null);
  const staff = (roles ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId && (r.role === "owner" || r.role === "manager")),
  );
  if (!staff) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff role required");
}

// ── listCourtsByClub (public) ───────────────────────────────────────────
const ListByClubSchema = z.object({
  clubId: UuidSchema,
  includeInactive: z.boolean().default(false),
});

export async function listCourtsByClub(input: unknown): Promise<ActionResult<Court[]>> {
  return runAction(ListByClubSchema, input, async ({ clubId, includeInactive }) => {
    const supabase = await getServerClient();
    let q = supabase
      .from("courts")
      .select("*")
      .eq("club_id", clubId)
      .order("ordinal");
    if (!includeInactive) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) throw new MpError("COURTS.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapCourt);
  });
}

// ── getCourt (public) ───────────────────────────────────────────────────
export async function getCourt(input: unknown): Promise<ActionResult<Court>> {
  return runAction(z.object({ courtId: UuidSchema }), input, async ({ courtId }) => {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("courts")
      .select("*")
      .eq("id", courtId)
      .single();
    if (error || !data) throw new MpError("COURTS.NOT_FOUND", "Court not found", 404);
    return mapCourt(data);
  });
}

// ── createCourt (staff) ─────────────────────────────────────────────────
export async function createCourt(input: unknown): Promise<ActionResult<Court>> {
  return runAction(CourtCreateSchema, input, async (data) => {
    await requireClubStaff(data.clubId);
    const supabase = await getServerClient();

    let ordinal = data.ordinal;
    if (ordinal === undefined) {
      const { data: last } = await supabase
        .from("courts")
        .select("ordinal")
        .eq("club_id", data.clubId)
        .order("ordinal", { ascending: false })
        .limit(1);
      ordinal = last && last[0] ? last[0].ordinal + 1 : 0;
    }

    const { data: row, error } = await supabase
      .from("courts")
      .insert({
        club_id: data.clubId,
        code: data.code,
        name: data.name ?? null,
        sport: data.sport,
        surface: data.surface ?? null,
        indoor: data.indoor,
        lights: data.lights,
        ordinal,
        active: true,
      } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("COURTS.DUPLICATE_CODE", "Court code already exists in this club", 409);
      }
      throw new MpError("COURTS.CREATE_FAILED", error.message, 500);
    }
    return mapCourt(row);
  });
}

// ── updateCourt (staff) ─────────────────────────────────────────────────
const UpdateSchema = z.object({
  courtId: UuidSchema,
  patch: CourtUpdateSchema,
});

export async function updateCourt(input: unknown): Promise<ActionResult<Court>> {
  return runAction(UpdateSchema, input, async ({ courtId, patch }) => {
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("courts")
      .select("club_id")
      .eq("id", courtId)
      .single();
    if (!existing) throw new MpError("COURTS.NOT_FOUND", "Court not found", 404);
    await requireClubStaff(existing.club_id);

    const payload: Record<string, unknown> = {};
    if (patch.code !== undefined) payload.code = patch.code;
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.sport !== undefined) payload.sport = patch.sport;
    if (patch.surface !== undefined) payload.surface = patch.surface;
    if (patch.indoor !== undefined) payload.indoor = patch.indoor;
    if (patch.lights !== undefined) payload.lights = patch.lights;
    if (patch.active !== undefined) payload.active = patch.active;
    if (patch.ordinal !== undefined) payload.ordinal = patch.ordinal;
    if (patch.surfaceColor !== undefined) payload.surface_color = patch.surfaceColor;
    if (patch.linesColor !== undefined) payload.lines_color = patch.linesColor;
    if (patch.lineStyle !== undefined) payload.line_style = patch.lineStyle;
    if (patch.strokeWidth !== undefined) payload.stroke_width = patch.strokeWidth;

    const { data, error } = await supabase
      .from("courts")
      .update(payload as never)
      .eq("id", courtId)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("COURTS.DUPLICATE_CODE", "Court code already exists in this club", 409);
      }
      throw new MpError("COURTS.UPDATE_FAILED", error.message, 400);
    }
    return mapCourt(data);
  });
}

// ── setCourtMaintenance (staff) ─────────────────────────────────────────
// Marca una cancha en mantenimiento: active=false + reason + until estimada.
// Mig 168. Mig 169 agrega insert al court_maintenance_log (historial).
export async function setCourtMaintenance(
  input: unknown,
): Promise<ActionResult<Court>> {
  return runAction(CourtMaintenanceSchema, input, async ({ courtId, reason, until }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("courts")
      .select("club_id")
      .eq("id", courtId)
      .single();
    if (!existing) throw new MpError("COURTS.NOT_FOUND", "Court not found", 404);
    await requireClubStaff(existing.club_id);
    const { data, error } = await supabase
      .from("courts")
      .update({
        active: false,
        maintenance_reason: reason ?? null,
        maintenance_until: until ?? null,
      } as never)
      .eq("id", courtId)
      .select()
      .single();
    if (error) throw new MpError("COURTS.UPDATE_FAILED", error.message, 500);
    // Log de la ventana (mig 169). Best-effort: no romper si falla.
    try {
      await supabase.from("court_maintenance_log").insert({
        court_id: courtId,
        reason: reason ?? null,
        expected_until: until ?? null,
        started_by: userId,
      } as never);
    } catch (e) {
      console.error("[setCourtMaintenance] log insert failed", e);
    }
    return mapCourt(data);
  });
}

// ── clearCourtMaintenance (staff) ───────────────────────────────────────
// Quita el mantenimiento: active=true + nulls. Si querés solo limpiar el
// motivo manteniendo bloqueada, usá updateCourt con active=false explícito.
// Mig 169: cierra el log activo (ended_at = now, ended_by = caller).
export async function clearCourtMaintenance(
  input: unknown,
): Promise<ActionResult<Court>> {
  return runAction(z.object({ courtId: UuidSchema }), input, async ({ courtId }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("courts")
      .select("club_id")
      .eq("id", courtId)
      .single();
    if (!existing) throw new MpError("COURTS.NOT_FOUND", "Court not found", 404);
    await requireClubStaff(existing.club_id);
    const { data, error } = await supabase
      .from("courts")
      .update({
        active: true,
        maintenance_reason: null,
        maintenance_until: null,
      } as never)
      .eq("id", courtId)
      .select()
      .single();
    if (error) throw new MpError("COURTS.UPDATE_FAILED", error.message, 500);
    // Cierra el log activo (si hay). Best-effort.
    try {
      await supabase
        .from("court_maintenance_log")
        .update({ ended_at: new Date().toISOString(), ended_by: userId } as never)
        .eq("court_id", courtId)
        .is("ended_at", null);
    } catch (e) {
      console.error("[clearCourtMaintenance] log close failed", e);
    }
    return mapCourt(data);
  });
}

// ── bulkSetCourtMaintenance (staff) ─────────────────────────────────────
// Marca N canchas del mismo club en mantenimiento de una. Valida que todas
// pertenezcan al mismo club (el staff check requiere club_id único).
export async function bulkSetCourtMaintenance(
  input: unknown,
): Promise<ActionResult<{ updated: number }>> {
  return runAction(
    BulkCourtMaintenanceSchema,
    input,
    async ({ courtIds, reason, until }) => {
      const supabase = await getServerClient();
      const { data: rows } = await supabase
        .from("courts")
        .select("id,club_id")
        .in("id", courtIds);
      const clubIds = new Set(((rows ?? []) as Array<{ club_id: string }>).map((r) => r.club_id));
      if (clubIds.size === 0) throw new MpError("COURTS.NOT_FOUND", "No courts", 404);
      if (clubIds.size > 1) {
        throw new MpError(
          "COURTS.MIXED_CLUBS",
          "All courts must belong to the same club",
          422,
        );
      }
      const clubId = clubIds.values().next().value as string;
      await requireClubStaff(clubId);
      const { error } = await supabase
        .from("courts")
        .update({
          active: false,
          maintenance_reason: reason ?? null,
          maintenance_until: until ?? null,
        } as never)
        .in("id", courtIds);
      if (error) throw new MpError("COURTS.UPDATE_FAILED", error.message, 500);
      return { updated: courtIds.length };
    },
  );
}

// ── createCourtBlocker (staff) ──────────────────────────────────────────
// Crea una reservation kind=event|class para bloquear un slot específico de
// una cancha (ej. "torneo de 14-16h", "clase de Diego de 18-19h"). Esto es
// distinto a setCourtMaintenance que cierra la cancha entera.
// La exclusion constraint de reservations bloquea automático si choca con
// otra reservation viva.
export async function createCourtBlocker(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(CourtBlockerSchema, input, async ({ courtId, startsAt, endsAt, kind, notes }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: court } = await supabase
      .from("courts")
      .select("club_id,sport")
      .eq("id", courtId)
      .single();
    if (!court) throw new MpError("COURTS.NOT_FOUND", "Court not found", 404);
    await requireClubStaff(court.club_id);
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      throw new MpError("COURTS.BLOCKER_INVALID_RANGE", "endsAt debe ser > startsAt", 422);
    }
    // tstzrange usa formato `[start,end)`.
    const during = `[${startsAt},${endsAt})`;
    const { data, error } = await supabase
      .from("reservations")
      .insert({
        club_id: court.club_id,
        court_id: courtId,
        during,
        status: "booked",
        sport: court.sport,
        visibility: "private",
        max_players: 4,
        organizer_id: userId,
        source: "admin",
        notes: notes ?? null,
        kind,
      } as never)
      .select("id")
      .single();
    if (error) {
      // 23P01 = exclusion violation (otro slot ya tomó esa ventana).
      if (error.code === "23P01") {
        throw new MpError(
          "COURTS.BLOCKER_OVERLAP",
          "Ya hay una reserva o bloqueo en esa ventana",
          409,
        );
      }
      throw new MpError("COURTS.BLOCKER_FAILED", error.message, 500);
    }
    return { id: data.id as string };
  });
}

// ── archiveCourt (soft delete via active=false) ─────────────────────────
export async function archiveCourt(input: unknown): Promise<ActionResult<Court>> {
  return runAction(z.object({ courtId: UuidSchema }), input, async ({ courtId }) => {
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("courts")
      .select("club_id")
      .eq("id", courtId)
      .single();
    if (!existing) throw new MpError("COURTS.NOT_FOUND", "Court not found", 404);
    await requireClubStaff(existing.club_id);

    const { data, error } = await supabase
      .from("courts")
      .update({ active: false } as never)
      .eq("id", courtId)
      .select()
      .single();
    if (error) throw new MpError("COURTS.UPDATE_FAILED", error.message, 400);
    return mapCourt(data);
  });
}
