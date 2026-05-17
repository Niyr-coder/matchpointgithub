"use server";

// Shifts (horarios de staff: coach/employee/manager). Tabla `shifts` creada
// en 032_role_gaps.sql con exclusion constraint que previene solapamientos
// del mismo user. RLS: el staff del club puede gestionar todos los shifts
// del club; el user dueño del shift puede ver el propio.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

export type ShiftLite = {
  id: string;
  clubId: string;
  userId: string;
  userDisplayName: string;
  role: "employee" | "manager" | "coach";
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "active" | "completed" | "cancelled" | "no_show";
  notes: string | null;
};

// Parser para tstzrange tipo '["2026-05-20 09:00:00+00","2026-05-20 13:00:00+00")'.
function parseRange(raw: string): { startsAt: string; endsAt: string } {
  const m = raw.match(/^[[(]"?([^",)]+)"?,"?([^",)]+)"?[\])]/);
  if (!m) return { startsAt: raw, endsAt: raw };
  return {
    startsAt: new Date(m[1]).toISOString(),
    endsAt: new Date(m[2]).toISOString(),
  };
}

// ── listShifts ─────────────────────────────────────────────────────────
const ListSchema = z.object({
  clubId: UuidSchema.optional(),
  userId: UuidSchema.optional(),
  fromIso: z.string().optional(),
  toIso: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listShifts(input: unknown): Promise<ActionResult<ShiftLite[]>> {
  return runAction(ListSchema, input, async (params) => {
    await requireUserId();
    const supabase = await getServerClient();
    let q = supabase
      .from("shifts")
      .select("id,club_id,user_id,role,during,status,notes,profiles!shifts_user_id_fkey(display_name)")
      .order("during", { ascending: true })
      .limit(params.limit);
    if (params.clubId) q = q.eq("club_id", params.clubId);
    if (params.userId) q = q.eq("user_id", params.userId);
    const { data, error } = await q;
    if (error) throw new MpError("SHIFTS.DB_ERROR", error.message, 500);
    return (data ?? []).map((r) => {
      const range = parseRange(r.during as string);
      const prof = r.profiles as { display_name?: string } | null;
      return {
        id: r.id as string,
        clubId: r.club_id as string,
        userId: r.user_id as string,
        userDisplayName: prof?.display_name ?? "Staff",
        role: r.role as ShiftLite["role"],
        startsAt: range.startsAt,
        endsAt: range.endsAt,
        status: r.status as ShiftLite["status"],
        notes: (r.notes as string | null) ?? null,
      };
    });
  });
}

// ── createShift ────────────────────────────────────────────────────────
// Falla con 23P01 (exclusion violation) si el user ya tiene un shift
// solapado: lo mapeamos a SHIFTS.OVERLAP.
const CreateSchema = z.object({
  clubId: UuidSchema,
  userId: UuidSchema,
  role: z.enum(["employee", "manager", "coach"]),
  startsAt: z.string(),
  endsAt: z.string(),
  notes: z.string().max(500).optional(),
});

export async function createShift(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(CreateSchema, input, async (data) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    if (new Date(data.endsAt) <= new Date(data.startsAt)) {
      throw new MpError("SHIFTS.INVALID_RANGE", "Hora de fin debe ser posterior al inicio", 422);
    }
    const range = `["${data.startsAt}","${data.endsAt}")`;
    const { data: row, error } = await supabase
      .from("shifts")
      .insert({
        club_id: data.clubId,
        user_id: data.userId,
        role: data.role,
        during: range,
        notes: data.notes ?? null,
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23P01") {
        throw new MpError("SHIFTS.OVERLAP", "Ese staff ya tiene un turno en ese horario", 409);
      }
      if (error.code === "42501") {
        throw new AuthError("AUTH.ROLE_REQUIRED", "Necesitas ser staff del club");
      }
      throw new MpError("SHIFTS.CREATE_FAILED", error.message, 500);
    }
    return { id: row.id as string };
  });
}

// ── deleteShift ────────────────────────────────────────────────────────
export async function deleteShift(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    await requireUserId();
    const supabase = await getServerClient();
    const { error } = await supabase.from("shifts").delete().eq("id", id);
    if (error) throw new MpError("SHIFTS.DELETE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}
