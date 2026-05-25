"use server";

// Reservations: organizer creates, staff/employee manages, RLS enforces who sees what.
// Anti-double-booking is enforced by the EXCLUDE GIST constraint at the DB level,
// so we don't need to re-implement it in the application layer. We DO check the
// cancellation window because that's a business rule (not a data integrity rule).
import "server-only";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
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
        const { assertNotSuspended } = await import("@/lib/auth/suspension");
        await assertNotSuspended(supabase, userId);

        // Ventana de reserva: no permitir reservar más allí del horizonte del club.
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
            for_user_id: data.forUserId ?? null,
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
        // Notif al organizer (staff o jugador). Si la reserva es PARA otro
        // user (mig 170 for_user_id), también notif al cliente.
        await notify({
          userId,
          role: "user",
          kind: "reservation_created",
          title: "Reserva confirmada",
          body: `${reservation.sport} · ${new Date(reservation.startsAt).toLocaleString("es-EC")}`,
          payload: { reservationId: reservation.id, clubId: reservation.clubId, courtId: reservation.courtId },
        });
        if (data.forUserId && data.forUserId !== userId) {
          await notify({
            userId: data.forUserId,
            role: "user",
            kind: "reservation_created",
            title: "Tienes una reserva nueva",
            body: `${reservation.sport} · ${new Date(reservation.startsAt).toLocaleString("es-EC")} · reservada por el club`,
            payload: { reservationId: reservation.id, clubId: reservation.clubId, courtId: reservation.courtId },
          });
        }
        // Invalidar el cache de las pantallas que dependen de reservations.
        // El realtime ya dispara router.refresh() en clientes conectados,
        // pero esto cubre re-navegaciones server-side y entradas frescas.
        revalidatePath("/dashboard/owner");
        revalidatePath("/dashboard/owner/club-reservas");
        revalidatePath("/dashboard/owner/club-canchas");
        revalidatePath("/dashboard/manager/club-reservas");
        revalidatePath("/dashboard/manager/club-canchas");
        revalidatePath("/dashboard/user/mis-reservas");
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

// ── searchUsersForBooking (staff) ───────────────────────────────────────
// Autocomplete del modal de reserva manual: busca clientes de MATCHPOINT
// por nombre/username/email. Requiere staff del club (ya logueado).
// Mig 170: alimenta reservations.for_user_id.
const SearchUsersSchema = z.object({
  clubId: UuidSchema,
  q: z.string().min(2).max(80),
  limit: z.number().int().min(1).max(20).default(8),
});

export async function searchUsersForBooking(
  input: unknown,
): Promise<
  ActionResult<
    Array<{
      id: string;
      displayName: string;
      username: string | null;
      email: string | null;
      avatarUrl: string | null;
    }>
  >
> {
  return runAction(SearchUsersSchema, input, async ({ clubId, q, limit }) => {
    // Reuse staff check del courts module (pero copiamos inline para no
    // crear dependencia cíclica entre actions).
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
    const staff = (roles ?? []).some(
      (r) =>
        r.role === "admin" ||
        (r.club_id === clubId && (r.role === "owner" || r.role === "manager")),
    );
    if (!staff) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff role required");

    const admin = getAdminClient();
    const term = `%${q.trim()}%`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("profiles")
      .select("id,display_name,username,avatar_url,auth_email:users!profiles_id_fkey(email)")
      .eq("is_system", false)
      .or(`display_name.ilike.${term},username.ilike.${term}`)
      .limit(limit);
    if (error) throw new MpError("USERS.SEARCH_FAILED", error.message, 500);
    return (
      (data ?? []) as Array<{
        id: string;
        display_name: string | null;
        username: string | null;
        avatar_url: string | null;
        auth_email: { email: string | null } | null;
      }>
    ).map((r) => ({
      id: r.id,
      displayName: r.display_name ?? "—",
      username: r.username ?? null,
      email: r.auth_email?.email ?? null,
      avatarUrl: r.avatar_url ?? null,
    }));
  });
}
