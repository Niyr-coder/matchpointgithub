"use server";

// Court CRUD for club staff. Reads are public; writes require owner/manager.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  CourtCreateSchema,
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
