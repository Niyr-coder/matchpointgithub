"use server";

// Walk-in queue and check-in actions for the front-desk employee role.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";

async function requireClubStaff(clubId: string): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  const ok = (roles ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId &&
        (r.role === "owner" || r.role === "manager" || r.role === "employee")),
  );
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff required");
  return user.id;
}

const CreateWalkinSchema = z.object({
  clubId: UuidSchema,
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(40).optional(),
  partySize: z.number().int().min(1).default(2),
  durationMinutes: z.number().int().positive().default(60),
  sport: z.enum(["pickleball", "padel", "tenis"]).optional(),
  notes: z.string().max(500).optional(),
});

export async function createWalkin(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(CreateWalkinSchema, input, async (data) => {
    await requireClubStaff(data.clubId);
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("walkins")
      .insert({
        club_id: data.clubId,
        customer_name: data.customerName,
        customer_phone: data.customerPhone ?? null,
        party_size: data.partySize,
        duration_minutes: data.durationMinutes,
        sport: data.sport ?? null,
        notes: data.notes ?? null,
      } as never)
      .select("id")
      .single();
    if (error) throw new MpError("WALKINS.CREATE_FAILED", error.message, 500);
    return { id: row.id as string };
  });
}

const RemoveWalkinSchema = z.object({ id: UuidSchema, clubId: UuidSchema });

export async function removeWalkin(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(RemoveWalkinSchema, input, async ({ id, clubId }) => {
    await requireClubStaff(clubId);
    const supabase = await getServerClient();
    const { error } = await supabase.from("walkins").delete().eq("id", id);
    if (error) throw new MpError("WALKINS.DELETE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── recordCheckIn (reservation or class) ───────────────────────────────
const CheckInSchema = z
  .object({
    clubId: UuidSchema,
    reservationId: UuidSchema.optional(),
    classSessionId: UuidSchema.optional(),
    userId: UuidSchema.optional(),
    method: z.enum(["qr", "manual", "auto"]).default("manual"),
  })
  .refine((d) => d.reservationId || d.classSessionId, {
    message: "reservationId or classSessionId is required",
  });

export async function recordCheckIn(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(CheckInSchema, input, async (data) => {
    const staffId = await requireClubStaff(data.clubId);
    const supabase = await getServerClient();
    const { data: row, error } = await supabase
      .from("check_ins")
      .insert({
        club_id: data.clubId,
        reservation_id: data.reservationId ?? null,
        class_session_id: data.classSessionId ?? null,
        user_id: data.userId ?? null,
        method: data.method,
        scanned_by: staffId,
      } as never)
      .select("id")
      .single();
    if (error) throw new MpError("CHECKINS.CREATE_FAILED", error.message, 500);
    return { id: row.id as string };
  });
}
