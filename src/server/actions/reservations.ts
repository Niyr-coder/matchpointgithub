"use server";

// Reservations: organizer creates, staff/employee manages, RLS enforces who sees what.
// Anti-double-booking is enforced by the EXCLUDE GIST constraint at the DB level,
// so we don't need to re-implement it in the application layer. We DO check the
// cancellation window because that's a business rule (not a data integrity rule).
import "server-only";

import { z } from "zod";
import { headers } from "next/headers";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { assertRateLimit, RATE_LIMITS } from "@/lib/api/ratelimit";
import { withIdempotency } from "@/lib/api/idempotency";
import {
  ReservationCancelSchema,
  ReservationCreateSchema,
  ReservationDetailSchema,
  ReservationListParamsSchema,
  ReservationSchema,
  WalkinCreateSchema,
  type Reservation,
  type ReservationDetail,
} from "@/lib/schemas/reservations";
import { UuidSchema } from "@/lib/schemas/common";
import { notify } from "@/server/notifications/dispatch";
import { getPlanForUser } from "@/lib/auth/plan";

// Free tier: cap mensual de reservas que un usuario puede organizar.
const FREE_RESERVATIONS_PER_MONTH = 4;

// Postgres `tstzrange` looks like `[2026-05-17T18:00:00+00:00,2026-05-17T19:30:00+00:00)`.
// We round-trip it into discrete startsAt/endsAt camelCase fields for the API.
function parseRange(range: string): { startsAt: string; endsAt: string } {
  const m = /^[\[(]([^,]+),([^)\]]+)[\)\]]$/.exec(range);
  if (!m) throw new Error(`bad tstzrange ${range}`);
  return { startsAt: new Date(m[1]).toISOString(), endsAt: new Date(m[2]).toISOString() };
}
function toRange(startsAt: string, endsAt: string): string {
  return `[${startsAt},${endsAt})`;
}

function mapReservation(row: Record<string, unknown>): Reservation {
  const { startsAt, endsAt } = parseRange(row.during as string);
  return ReservationSchema.parse({
    id: row.id,
    clubId: row.club_id,
    courtId: row.court_id,
    startsAt,
    endsAt,
    status: row.status,
    sport: row.sport,
    visibility: row.visibility,
    maxPlayers: row.max_players,
    notes: row.notes ?? null,
    organizerId: row.organizer_id,
    source: row.source,
    cancellationReason: row.cancellation_reason ?? null,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at ?? null,
    version: row.version ?? 1,
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

async function isClubStaff(userId: string, clubId: string): Promise<boolean> {
  const supabase = await getServerClient();
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", userId)
    .is("revoked_at", null);
  return (roles ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId &&
        (r.role === "owner" || r.role === "manager" || r.role === "employee")),
  );
}

// ── listReservations ───────────────────────────────────────────────────
export async function listReservations(
  input: unknown,
): Promise<ActionResult<Reservation[]>> {
  return runAction(ReservationListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let q = supabase.from("reservations").select("*").range(from, to);
    if (params.clubId) q = q.eq("club_id", params.clubId);
    if (params.courtId) q = q.eq("court_id", params.courtId);
    if (params.organizerId) q = q.eq("organizer_id", params.organizerId);
    if (params.status) q = q.eq("status", params.status);

    // Postgres range overlap operator: `during && tstzrange(from, to)`.
    if (params.from && params.to) {
      q = q.filter("during", "&&", `[${params.from},${params.to})`);
    } else if (params.from) {
      q = q.gte("during", params.from);
    }

    q = q.order("during", { ascending: true });

    const { data, error } = await q;
    if (error) throw new MpError("RESERVATIONS.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapReservation);
  });
}

// ── getReservation ─────────────────────────────────────────────────────
const GetSchema = z.object({ id: UuidSchema });

export async function getReservation(
  input: unknown,
): Promise<ActionResult<ReservationDetail>> {
  return runAction(GetSchema, input, async ({ id }) => {
    const supabase = await getServerClient();
    const [{ data: rsv, error }, { data: participants }] = await Promise.all([
      supabase.from("reservations").select("*").eq("id", id).single(),
      supabase.from("reservation_participants").select("*").eq("reservation_id", id),
    ]);
    if (error || !rsv) throw new MpError("RESERVATIONS.NOT_FOUND", "Reservation not found", 404);
    const detail: ReservationDetail = {
      reservation: mapReservation(rsv),
      participants: (participants ?? []).map((p) => ({
        userId: p.user_id as string,
        status: p.status as ReservationDetail["participants"][number]["status"],
        invitedBy: (p.invited_by as string) ?? null,
        joinedAt: (p.joined_at as string) ?? null,
      })),
    };
    return ReservationDetailSchema.parse(detail);
  });
}

// ── createReservation (organizer = current user) ───────────────────────
export async function createReservation(input: unknown): Promise<ActionResult<Reservation>> {
  return runAction(ReservationCreateSchema, input, async (data) => {
    const userId = await requireUserId();
    await assertRateLimit({ key: `rsv:create:${userId}`, ...RATE_LIMITS.mutationsAuthn });
    const idemKey = (await headers()).get("idempotency-key") ?? undefined;

    return withIdempotency(
      { key: idemKey, scope: "createReservation", userId, input: data },
      async () => {
        const supabase = await getServerClient();

        // Gating por plan: Free puede crear hasta FREE_RESERVATIONS_PER_MONTH/mes.
        // Premium expirado se trata como Free en getPlanForUser. Premium activo no tiene tope.
        const plan = await getPlanForUser(supabase, userId);
        if (plan.tier === "free") {
          // Mes calendario en UTC para alinear con la columna `during` (tstzrange en UTC).
          const now = new Date();
          const monthStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
          );
          const monthEnd = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
          );
          const overlap = `[${monthStart.toISOString()},${monthEnd.toISOString()})`;

          const { count, error: countErr } = await supabase
            .from("reservations")
            .select("id", { count: "exact", head: true })
            .eq("organizer_id", userId)
            .neq("status", "cancelled")
            .filter("during", "&&", overlap);

          if (countErr) {
            throw new MpError("RESERVATIONS.DB_ERROR", countErr.message, 500);
          }
          if ((count ?? 0) >= FREE_RESERVATIONS_PER_MONTH) {
            throw new MpError(
              "PLAN.FREE_LIMIT_REACHED",
              "Llegaste al límite mensual de reservas del plan Free (4/mes). Activa Premium para reservas ilimitadas.",
              402,
            );
          }
        }

        // Ventana de reserva: no permitir reservar más allá del horizonte del club.
        const { data: settings } = await supabase
          .from("club_settings")
          .select("reservation_window_days")
          .eq("club_id", data.clubId)
          .maybeSingle();
        if (settings) {
          const horizon = new Date();
          horizon.setUTCDate(horizon.getUTCDate() + (settings.reservation_window_days as number));
          if (new Date(data.startsAt) > horizon) {
            throw new MpError(
              "RESERVATION.OUTSIDE_WINDOW",
              `Bookings open up to ${settings.reservation_window_days} days ahead`,
              422,
            );
          }
        }
        if (new Date(data.startsAt).getTime() < Date.now() - 60_000) {
          throw new MpError(
            "RESERVATION.IN_PAST",
            "startsAt cannot be in the past",
            422,
          );
        }

        const { data: row, error } = await supabase
          .from("reservations")
          .insert({
            club_id: data.clubId,
            court_id: data.courtId,
            during: toRange(data.startsAt, data.endsAt),
            sport: data.sport,
            visibility: data.visibility,
            max_players: data.maxPlayers,
            notes: data.notes ?? null,
            organizer_id: userId,
            source: "app",
            status: "booked",
          } as never)
          .select()
          .single();

        if (error) {
          if (error.code === "23P01") {
            throw new MpError(
              "RESERVATION.SLOT_TAKEN",
              "That slot was just booked by someone else. Pick another time.",
              409,
            );
          }
          throw new MpError("RESERVATIONS.CREATE_FAILED", error.message, 500);
        }
        const reservation = mapReservation(row);
        await notify({
          userId,
          role: "user",
          kind: "reservation_created",
          title: "Reserva confirmada",
          body: `${reservation.sport} · ${new Date(reservation.startsAt).toLocaleString("es-EC")}`,
          payload: { reservationId: reservation.id, clubId: reservation.clubId, courtId: reservation.courtId },
        });
        return reservation;
      },
    );
  });
}

// ── cancelReservation ──────────────────────────────────────────────────
const CancelInputSchema = z.object({
  id: UuidSchema,
  body: ReservationCancelSchema,
});

export async function cancelReservation(input: unknown): Promise<ActionResult<Reservation>> {
  return runAction(CancelInputSchema, input, async ({ id, body }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();

    const { data: current, error: getErr } = await supabase
      .from("reservations")
      .select("*")
      .eq("id", id)
      .single();
    if (getErr || !current) throw new MpError("RESERVATIONS.NOT_FOUND", "Not found", 404);

    if (["cancelled", "no_show", "completed"].includes(current.status)) {
      throw new MpError(
        "RESERVATION.CANNOT_CANCEL",
        `Cannot cancel from status '${current.status}'`,
        409,
      );
    }

    const isOrganizer = current.organizer_id === userId;
    const staff = await isClubStaff(userId, current.club_id);
    if (!isOrganizer && !staff) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Only organizer or club staff can cancel");
    }

    // Cancellation-window: organizer can only cancel within the club's window.
    if (isOrganizer && !staff) {
      const { data: settings } = await supabase
        .from("club_settings")
        .select("cancellation_window_hours")
        .eq("club_id", current.club_id)
        .maybeSingle();
      const windowHours = (settings?.cancellation_window_hours as number) ?? 24;
      const { startsAt } = parseRange(current.during as string);
      const hoursUntilStart = (new Date(startsAt).getTime() - Date.now()) / 36e5;
      if (hoursUntilStart < windowHours) {
        throw new MpError(
          "RESERVATION.WINDOW_CLOSED",
          `Cancellations require at least ${windowHours}h notice`,
          422,
        );
      }
    }

    const { data, error } = await supabase
      .from("reservations")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: body.reason ?? null,
      } as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new MpError("RESERVATIONS.CANCEL_FAILED", error.message, 500);
    const cancelled = mapReservation(data);
    await notify({
      userId: cancelled.organizerId,
      role: "user",
      kind: "reservation_cancelled",
      title: "Reserva cancelada",
      body: body.reason ?? null,
      payload: { reservationId: cancelled.id, clubId: cancelled.clubId },
    });
    return cancelled;
  });
}

// ── createWalkin (employee/manager) ────────────────────────────────────
export async function createWalkin(input: unknown): Promise<ActionResult<Reservation>> {
  return runAction(WalkinCreateSchema, input, async (data) => {
    const userId = await requireUserId();
    if (!(await isClubStaff(userId, data.clubId))) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff role required");
    }
    if (!data.courtId) {
      throw new MpError(
        "WALKIN.COURT_REQUIRED",
        "Walk-ins need an explicit court assignment",
        422,
      );
    }
    const supabase = await getServerClient();

    const startsAt = data.startsAt ?? new Date().toISOString();
    const endsAt = new Date(
      new Date(startsAt).getTime() + data.durationMinutes * 60_000,
    ).toISOString();

    const { data: rsv, error } = await supabase
      .from("reservations")
      .insert({
        club_id: data.clubId,
        court_id: data.courtId,
        during: toRange(startsAt, endsAt),
        sport: data.sport,
        visibility: "private",
        max_players: data.partySize > 4 ? 8 : 4,
        notes: `Walk-in · ${data.customerName}`,
        organizer_id: userId,
        source: "walkin",
        status: "checked_in",
      } as never)
      .select()
      .single();

    if (error) {
      if (error.code === "23P01") {
        throw new MpError("RESERVATION.SLOT_TAKEN", "Court occupied at that time", 409);
      }
      throw new MpError("WALKIN.CREATE_FAILED", error.message, 500);
    }

    // Mirror to walkins table so reports can filter by source.
    await supabase
      .from("walkins")
      .insert({
        club_id: data.clubId,
        court_id: data.courtId,
        customer_name: data.customerName,
        customer_phone: data.customerPhone ?? null,
        party_size: data.partySize,
        duration_minutes: data.durationMinutes,
        created_reservation_id: rsv.id,
        attended_by: userId,
      } as never);

    return mapReservation(rsv);
  });
}
