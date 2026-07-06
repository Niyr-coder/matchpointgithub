"use server";

// Walk-in queue and check-in actions for the front-desk employee role.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { assertClubStaff, FRONT_DESK_ROLES } from "@/lib/auth/club-staff";
import { IsoDateTimeSchema, UuidSchema } from "@/lib/schemas/common";
import { resolveReservationForCheckIn } from "@/server/queries/checkin-resolve";
import { notify } from "@/server/notifications/dispatch";
import { revalidateCourtOccupancy } from "./_revalidate-occupancy";

// Recepción es dominio front-desk: owner/manager/employee (+ admin bypass).
async function requireClubStaff(clubId: string): Promise<string> {
  return assertClubStaff(clubId, FRONT_DESK_ROLES);
}

const CreateWalkinSchema = z.object({
  clubId: UuidSchema,
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(40).optional(),
  partySize: z.number().int().min(1).default(2),
  durationMinutes: z.number().int().positive().default(60),
  sport: z.enum(["pickleball", "padel", "tennis"]).optional(),
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
        sport: data.sport ?? "pickleball",
        notes: data.notes ?? null,
      } as never)
      .select("id")
      .single();
    if (error) throw new MpError("WALKINS.CREATE_FAILED", error.message, 500);
    revalidateCourtOccupancy();
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
    revalidateCourtOccupancy();
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

    if (data.reservationId) {
      const { data: existing } = await supabase
        .from("check_ins")
        .select("id")
        .eq("reservation_id", data.reservationId)
        .maybeSingle();
      if (existing?.id) {
        return { id: existing.id as string };
      }

      const { data: rsv, error: rsvErr } = await supabase
        .from("reservations")
        .select("id,organizer_id,status")
        .eq("id", data.reservationId)
        .eq("club_id", data.clubId)
        .maybeSingle();
      if (rsvErr) throw new MpError("CHECKINS.RESERVATION_LOOKUP_FAILED", rsvErr.message, 500);
      if (!rsv) throw new MpError("CHECKINS.RESERVATION_NOT_FOUND", "Reserva no encontrada en este club", 404);

      const status = rsv.status as string;
      if (!["booked", "confirmed"].includes(status)) {
        throw new MpError(
          "CHECKINS.INVALID_STATUS",
          `La reserva ya está en estado «${status}»`,
          409,
        );
      }

      const playerId = data.userId ?? (rsv.organizer_id as string);

      const { data: row, error } = await supabase
        .from("check_ins")
        .insert({
          club_id: data.clubId,
          reservation_id: data.reservationId,
          class_session_id: null,
          user_id: playerId,
          method: data.method,
          scanned_by: staffId,
        } as never)
        .select("id")
        .single();
      if (error) throw new MpError("CHECKINS.CREATE_FAILED", error.message, 500);

      const { error: upErr } = await supabase
        .from("reservations")
        .update({ status: "checked_in" } as never)
        .eq("id", data.reservationId)
        .eq("club_id", data.clubId);
      if (upErr) throw new MpError("CHECKINS.RESERVATION_UPDATE_FAILED", upErr.message, 500);

      await notify({
        userId: playerId,
        role: "user",
        kind: "reservation_checked_in",
        title: "Check-in en el club",
        body: "Recepción confirmó tu llegada. Ya puedes pasar a la cancha.",
        payload: {
          reservationId: data.reservationId,
          clubId: data.clubId,
        },
      });
      revalidateCourtOccupancy({ includePlayer: true });

      return { id: row.id as string };
    }

    const { data: row, error } = await supabase
      .from("check_ins")
      .insert({
        club_id: data.clubId,
        reservation_id: null,
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

const CheckInByCodeSchema = z.object({
  clubId: UuidSchema,
  payload: z.string().min(1).max(240),
  method: z.enum(["qr", "manual"]).default("manual"),
});

/** Buscar por código RV-/WK- o payload QR y registrar check-in. */
export async function checkInByCode(
  input: unknown,
): Promise<ActionResult<{ id: string; alreadyDone?: boolean }>> {
  return runAction(CheckInByCodeSchema, input, async (data) => {
    await requireClubStaff(data.clubId);
    const supabase = await getServerClient();
    const resolved = await resolveReservationForCheckIn(supabase, data.clubId, data.payload);
    if (!resolved) {
      throw new MpError(
        "CHECKINS.CODE_NOT_FOUND",
        "No encontramos una reserva con ese código en este club",
        404,
      );
    }

    if (resolved.status === "checked_in") {
      const { data: existing } = await supabase
        .from("check_ins")
        .select("id")
        .eq("reservation_id", resolved.id)
        .maybeSingle();
      return {
        id: (existing?.id as string) ?? resolved.id,
        alreadyDone: true,
      };
    }

    // Código válido pero la reserva ya cerró — mensaje honesto, distinto de
    // "código no encontrado".
    if (resolved.status === "no_show" || resolved.status === "completed") {
      const label = resolved.status === "no_show" ? "no-show" : "jugada";
      throw new MpError(
        "CHECKINS.INVALID_STATUS",
        `El código existe pero la reserva ya está marcada como ${label}`,
        409,
      );
    }

    const inner = await recordCheckIn({
      clubId: data.clubId,
      reservationId: resolved.id,
      userId: resolved.organizerId,
      method: data.method,
    });
    if (!inner.ok) {
      throw new MpError(inner.error.code, inner.error.message, 400);
    }
    return { id: inner.data.id };
  });
}

function toRange(startsAt: string, endsAt: string): string {
  return `[${startsAt},${endsAt})`;
}

const AssignWalkinCourtSchema = z.object({
  clubId: UuidSchema,
  walkinId: UuidSchema,
  courtId: UuidSchema,
  startsAt: IsoDateTimeSchema.optional(),
});

/** Crea reserva walk-in en cancha y saca el walk-in de la cola. */
export async function assignWalkinCourt(
  input: unknown,
): Promise<ActionResult<{ reservationId: string }>> {
  return runAction(AssignWalkinCourtSchema, input, async (data) => {
    const staffId = await requireClubStaff(data.clubId);
    const supabase = await getServerClient();

    const { data: walkin, error: wErr } = await supabase
      .from("walkins")
      .select(
        "id,customer_name,customer_phone,party_size,duration_minutes,sport,notes,created_reservation_id",
      )
      .eq("id", data.walkinId)
      .eq("club_id", data.clubId)
      .maybeSingle();
    if (wErr) throw new MpError("WALKINS.LOOKUP_FAILED", wErr.message, 500);
    if (!walkin) throw new MpError("WALKINS.NOT_FOUND", "Walk-in no encontrado", 404);
    if (walkin.created_reservation_id) {
      throw new MpError("WALKINS.ALREADY_ASSIGNED", "Este walk-in ya tiene cancha asignada", 409);
    }

    const { data: court, error: cErr } = await supabase
      .from("courts")
      .select("id,sport,active")
      .eq("id", data.courtId)
      .eq("club_id", data.clubId)
      .maybeSingle();
    if (cErr) throw new MpError("WALKINS.COURT_LOOKUP_FAILED", cErr.message, 500);
    if (!court?.id) throw new MpError("WALKINS.COURT_NOT_FOUND", "Cancha no encontrada", 404);
    if (!court.active) throw new MpError("WALKINS.COURT_INACTIVE", "La cancha no está activa", 422);

    const sport = (walkin.sport as string | null) ?? (court.sport as string);
    const startsAt = data.startsAt ?? new Date().toISOString();
    const endsAt = new Date(
      new Date(startsAt).getTime() + ((walkin.duration_minutes as number) ?? 60) * 60_000,
    ).toISOString();
    const partySize = (walkin.party_size as number) ?? 2;
    const noteBase = `Walk-in · ${walkin.customer_name as string}`;
    const extra = walkin.notes ? ` · ${walkin.notes as string}` : "";

    const { data: rsv, error: rErr } = await supabase
      .from("reservations")
      .insert({
        club_id: data.clubId,
        court_id: data.courtId,
        during: toRange(startsAt, endsAt),
        sport,
        visibility: "private",
        max_players: partySize > 4 ? 8 : Math.max(2, partySize),
        notes: noteBase + extra,
        organizer_id: staffId,
        source: "walkin",
        status: "booked",
      } as never)
      .select("id")
      .single();
    if (rErr) {
      if (rErr.code === "23P01") {
        throw new MpError("RESERVATION.SLOT_TAKEN", "Esa cancha ya está ocupada en ese horario", 409);
      }
      throw new MpError("WALKINS.ASSIGN_FAILED", rErr.message, 500);
    }

    const { error: upErr } = await supabase
      .from("walkins")
      .update({
        court_id: data.courtId,
        created_reservation_id: rsv.id,
        attended_by: staffId,
        sport,
      } as never)
      .eq("id", data.walkinId);
    if (upErr) throw new MpError("WALKINS.UPDATE_FAILED", upErr.message, 500);

    revalidateCourtOccupancy();
    return { reservationId: rsv.id as string };
  });
}

const RescheduleWalkinSchema = z.object({
  clubId: UuidSchema,
  walkinId: UuidSchema,
  durationMinutes: z.number().int().min(15).max(240),
});

/** Ajusta duración de un walk-in aún en cola (sin reserva creada). */
export async function rescheduleWalkin(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(RescheduleWalkinSchema, input, async (data) => {
    await requireClubStaff(data.clubId);
    const supabase = await getServerClient();
    const { data: walkin } = await supabase
      .from("walkins")
      .select("id,created_reservation_id")
      .eq("id", data.walkinId)
      .eq("club_id", data.clubId)
      .maybeSingle();
    if (!walkin) throw new MpError("WALKINS.NOT_FOUND", "Walk-in no encontrado", 404);
    if (walkin.created_reservation_id) {
      throw new MpError(
        "WALKINS.ALREADY_ASSIGNED",
        "Ya tiene cancha: edita la reserva desde Reservas hoy",
        409,
      );
    }
    const { error } = await supabase
      .from("walkins")
      .update({ duration_minutes: data.durationMinutes } as never)
      .eq("id", data.walkinId);
    if (error) throw new MpError("WALKINS.RESCHEDULE_FAILED", error.message, 500);
    revalidateCourtOccupancy();
    return { ok: true as const };
  });
}

/** Alias explícito para escaneo QR (mismo flujo que checkInByCode). */
export async function scanCheckIn(
  input: unknown,
): Promise<ActionResult<{ id: string; alreadyDone?: boolean }>> {
  if (typeof input === "object" && input !== null) {
    return checkInByCode({ ...(input as Record<string, unknown>), method: "qr" });
  }
  return checkInByCode(input);
}
