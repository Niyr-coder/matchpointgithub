"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { notify } from "@/server/notifications/dispatch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

type RawReservation = {
  id: string;
  club_id: string;
  court_id: string;
  organizer_id: string;
  for_user_id: string | null;
  during: string;
  status: string;
  sport: string;
  source: string;
  created_at: string;
  cancellation_reason: string | null;
};

type RawPayment = {
  reservation_id: string;
  user_id: string | null;
  amount_cents: number;
  method: string;
  status: string;
  transaction_id: string | null;
};

type RawTransaction = {
  id: string;
  ref_id: string | null;
  amount_cents: number;
  currency: string;
  method: string;
  status: string;
  customer_user_id: string | null;
  customer_name: string | null;
};

export type AdminReservationRow = {
  id: string;
  club: string;
  clubCity: string;
  court: string;
  player: string;
  method: string;
  status: string;
  paymentStatus: string | null;
  transactionId: string | null;
  when: string;
  durationMin: number;
  priceCents: number;
  refundable: boolean;
  flag: string | null;
};

function parseRange(range: string): { startsAt: string; durationMin: number } {
  const m = /^[\[(]([^,]+),([^)\]]+)[\)\]]$/.exec(String(range));
  if (!m) return { startsAt: "", durationMin: 0 };
  const startsAt = new Date(m[1]).toISOString();
  const durationMin = Math.max(0, Math.round((new Date(m[2]).getTime() - new Date(m[1]).getTime()) / 60000));
  return { startsAt, durationMin };
}

function nameFor(names: Map<string, string>, id: string | null | undefined, fallback = "Usuario"): string {
  if (!id) return fallback;
  return names.get(id) ?? fallback;
}

function reservationFlag(row: RawReservation, paymentStatus: string | null, txId: string | null): string | null {
  if (row.cancellation_reason) return row.cancellation_reason;
  if (paymentStatus === "pending") return "Pago pendiente";
  if (paymentStatus === "pending_proof") return "Esperando comprobante";
  if (paymentStatus === "proof_submitted") return "Comprobante en revisión";
  if (paymentStatus === "disputed") return "Pago en disputa";
  if (paymentStatus === "failed") return "Pago fallido";
  if (!txId && !["cancelled", "completed", "no_show"].includes(row.status)) return "Sin transacción ligada";
  return null;
}

export async function listAdminReservations(): Promise<ActionResult<AdminReservationRow[]>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    const admin = getAdminClient() as unknown as LooseClient;

    const { data: reservations, error } = await admin
      .from("reservations")
      .select("id,club_id,court_id,organizer_id,for_user_id,during,status,sport,source,created_at,cancellation_reason")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new MpError("RESERVATIONS.ADMIN_LIST_FAILED", error.message, 500);

    const rows = ((reservations ?? []) as RawReservation[]).filter(Boolean);
    const reservationIds = rows.map((r) => r.id);
    const clubIds = Array.from(new Set(rows.map((r) => r.club_id).filter(Boolean)));
    const courtIds = Array.from(new Set(rows.map((r) => r.court_id).filter(Boolean)));
    const userIds = new Set<string>();
    for (const r of rows) {
      userIds.add(r.organizer_id);
      if (r.for_user_id) userIds.add(r.for_user_id);
    }

    const [clubsRes, courtsRes, participantsRes, paymentsRes, txByRefRes] = await Promise.all([
      clubIds.length ? admin.from("clubs").select("id,name,city").in("id", clubIds) : Promise.resolve({ data: [] }),
      courtIds.length ? admin.from("courts").select("id,name,code").in("id", courtIds) : Promise.resolve({ data: [] }),
      reservationIds.length
        ? admin.from("reservation_participants").select("reservation_id,user_id,status").in("reservation_id", reservationIds)
        : Promise.resolve({ data: [] }),
      reservationIds.length
        ? admin
            .from("reservation_payments")
            .select("reservation_id,user_id,amount_cents,method,status,transaction_id")
            .in("reservation_id", reservationIds)
        : Promise.resolve({ data: [] }),
      reservationIds.length
        ? admin
            .from("transactions")
            .select("id,ref_id,amount_cents,currency,method,status,customer_user_id,customer_name")
            .eq("kind", "reservation")
            .in("ref_id", reservationIds)
        : Promise.resolve({ data: [] }),
    ]);

    const payments = ((paymentsRes.data ?? []) as RawPayment[]).filter(Boolean);
    const txIds = Array.from(new Set(payments.map((p) => p.transaction_id).filter(Boolean))) as string[];
    const txByIdRes =
      txIds.length > 0
        ? await admin
            .from("transactions")
            .select("id,ref_id,amount_cents,currency,method,status,customer_user_id,customer_name")
            .in("id", txIds)
        : { data: [] };

    for (const p of payments) {
      if (p.user_id) userIds.add(p.user_id);
    }
    for (const p of (participantsRes.data ?? []) as Array<Record<string, unknown>>) {
      if (p.user_id) userIds.add(p.user_id as string);
    }
    for (const t of [...((txByRefRes.data ?? []) as RawTransaction[]), ...((txByIdRes.data ?? []) as RawTransaction[])]) {
      if (t.customer_user_id) userIds.add(t.customer_user_id);
    }

    const profilesRes =
      userIds.size > 0
        ? await admin.from("profiles").select("id,display_name,username").in("id", Array.from(userIds))
        : { data: [] };

    const clubById = new Map<string, { name: string; city: string }>();
    for (const c of (clubsRes.data ?? []) as Array<Record<string, unknown>>) {
      clubById.set(c.id as string, {
        name: (c.name as string | null) ?? "Club",
        city: (c.city as string | null) ?? "—",
      });
    }

    const courtById = new Map<string, string>();
    for (const c of (courtsRes.data ?? []) as Array<Record<string, unknown>>) {
      courtById.set(c.id as string, ((c.name as string | null) || (c.code as string | null) || "Cancha") as string);
    }

    const names = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as Array<Record<string, unknown>>) {
      names.set(
        p.id as string,
        ((p.display_name as string | null) || (p.username as string | null) || "Usuario") as string,
      );
    }

    const participantsByReservation = new Map<string, string[]>();
    for (const p of (participantsRes.data ?? []) as Array<Record<string, unknown>>) {
      if (p.status && ["cancelled", "left"].includes(p.status as string)) continue;
      const reservationId = p.reservation_id as string;
      const list = participantsByReservation.get(reservationId) ?? [];
      list.push(nameFor(names, p.user_id as string | null));
      participantsByReservation.set(reservationId, list);
    }

    const paymentByReservation = new Map<string, RawPayment>();
    for (const p of payments) {
      const current = paymentByReservation.get(p.reservation_id);
      if (!current || (!current.transaction_id && p.transaction_id)) {
        paymentByReservation.set(p.reservation_id, p);
      }
    }

    const txByReservation = new Map<string, RawTransaction>();
    const txById = new Map<string, RawTransaction>();
    for (const t of [...((txByRefRes.data ?? []) as RawTransaction[]), ...((txByIdRes.data ?? []) as RawTransaction[])]) {
      txById.set(t.id, t);
      if (t.ref_id) txByReservation.set(t.ref_id, t);
    }
    for (const p of payments) {
      if (p.transaction_id && txById.has(p.transaction_id)) {
        txByReservation.set(p.reservation_id, txById.get(p.transaction_id)!);
      }
    }

    return rows.map((r) => {
      const { startsAt, durationMin } = parseRange(r.during);
      const club = clubById.get(r.club_id);
      const payment = paymentByReservation.get(r.id);
      const tx = txByReservation.get(r.id);
      const participantNames = participantsByReservation.get(r.id) ?? [];
      const player =
        participantNames.length > 0
          ? participantNames.slice(0, 3).join(" / ")
          : nameFor(names, r.for_user_id ?? r.organizer_id);
      const paymentStatus = tx?.status ?? payment?.status ?? null;
      const priceCents = tx?.amount_cents ?? payment?.amount_cents ?? 0;
      const method = tx?.method ?? payment?.method ?? (priceCents > 0 ? "transfer" : "free");
      return {
        id: r.id,
        club: club?.name ?? "Club",
        clubCity: club?.city ?? "—",
        court: courtById.get(r.court_id) ?? "Cancha",
        player,
        method,
        status: paymentStatus === "refunded" ? "refunded" : r.status,
        paymentStatus,
        transactionId: tx?.id ?? payment?.transaction_id ?? null,
        when: startsAt,
        durationMin,
        priceCents,
        refundable: Boolean(tx?.id && tx.status === "captured" && priceCents > 0),
        flag: reservationFlag(r, paymentStatus, tx?.id ?? payment?.transaction_id ?? null),
      };
    });
  });
}

export async function cancelReservationAdmin(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({
      reservationId: UuidSchema,
      reason: z.string().trim().max(500).optional(),
    }),
    input,
    async ({ reservationId, reason }) => {
      const adminId = await requireAdminUserId();
      const adminClient = getAdminClient();
      await setAuditActor(adminClient, adminId, "admin");
      const admin = adminClient as unknown as LooseClient;

      const { data: reservation, error: readErr } = await admin
        .from("reservations")
        .select("id,status,organizer_id,for_user_id,club_id")
        .eq("id", reservationId)
        .maybeSingle();
      if (readErr) throw new MpError("RESERVATIONS.ADMIN_READ_FAILED", readErr.message, 500);
      if (!reservation) throw new MpError("RESERVATIONS.NOT_FOUND", "Reserva no encontrada", 404);
      if (["cancelled", "no_show", "completed"].includes(reservation.status as string)) {
        throw new MpError("RESERVATION.CANNOT_CANCEL", "Esta reserva ya no se puede cancelar", 409);
      }

      const reasonText = reason?.trim() || "Cancelada por soporte MATCHPOINT";
      const { error } = await admin
        .from("reservations")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reasonText,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reservationId);
      if (error) throw new MpError("RESERVATIONS.ADMIN_CANCEL_FAILED", error.message, 500);

      const recipients = Array.from(
        new Set([reservation.organizer_id as string, reservation.for_user_id as string | null].filter(Boolean) as string[]),
      );
      await Promise.all(
        recipients.map((userId) =>
          notify({
            userId,
            role: "user",
            kind: "reservation_cancelled",
            title: "Reserva cancelada",
            body: reasonText,
            payload: { reservationId, clubId: reservation.club_id, cancelled_by: "admin" },
          }),
        ),
      );

      revalidatePath("/dashboard/admin/admin-reservas");
      revalidatePath("/dashboard/user/mis-reservas");
      return { ok: true as const };
    },
  );
}

export async function refundReservationAdmin(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(
    z.object({
      reservationId: UuidSchema,
      reason: z.string().trim().min(2, "Motivo requerido").max(500),
      refundReference: z
        .string()
        .trim()
        .max(120)
        .optional()
        .transform((v) => (v && v.length > 0 ? v : undefined)),
    }),
    input,
    async ({ reservationId, reason, refundReference }) => {
      const adminId = await requireAdminUserId();
      const adminClient = getAdminClient();
      await setAuditActor(adminClient, adminId, "admin");
      const admin = adminClient as unknown as LooseClient;

      const { data: reservation, error: reservationErr } = await admin
        .from("reservations")
        .select("id,status,organizer_id,for_user_id,club_id")
        .eq("id", reservationId)
        .maybeSingle();
      if (reservationErr) throw new MpError("RESERVATIONS.ADMIN_READ_FAILED", reservationErr.message, 500);
      if (!reservation) throw new MpError("RESERVATIONS.NOT_FOUND", "Reserva no encontrada", 404);

      const { data: payment } = await admin
        .from("reservation_payments")
        .select("reservation_id,transaction_id")
        .eq("reservation_id", reservationId)
        .not("transaction_id", "is", null)
        .maybeSingle();

      let txQuery = admin
        .from("transactions")
        .select("id,status,amount_cents,currency,customer_user_id,customer_name")
        .eq("kind", "reservation");
      txQuery = payment?.transaction_id
        ? txQuery.eq("id", payment.transaction_id as string)
        : txQuery.eq("ref_id", reservationId);
      const { data: tx, error: txErr } = await txQuery.maybeSingle();
      if (txErr) throw new MpError("TX.LOAD_FAILED", txErr.message, 500);
      if (!tx) throw new MpError("TX.NOT_FOUND", "Esta reserva no tiene una transacción reembolsable", 404);
      if ((tx.status as string) === "refunded") throw new MpError("TX.ALREADY_REFUNDED", "Ya estaba reembolsada", 409);
      if ((tx.status as string) !== "captured") {
        throw new MpError("TX.NOT_REFUNDABLE", "Solo se pueden reembolsar pagos capturados", 409);
      }

      const now = new Date().toISOString();
      const { error: refundErr } = await admin.from("refunds").insert({
        transaction_id: tx.id,
        amount_cents: tx.amount_cents,
        reason,
        created_by: adminId,
      });
      if (refundErr) throw new MpError("REFUND.CREATE_FAILED", refundErr.message, 500);

      const { error: updateTxErr } = await admin
        .from("transactions")
        .update({
          status: "refunded",
          refund_reason: reason,
          refund_reference: refundReference ?? null,
          refunded_at: now,
          refunded_by: adminId,
        })
        .eq("id", tx.id)
        .eq("status", "captured");
      if (updateTxErr) throw new MpError("TX.REFUND_FAILED", updateTxErr.message, 500);

      if (!["cancelled", "no_show", "completed"].includes(reservation.status as string)) {
        await admin
          .from("reservations")
          .update({
            status: "cancelled",
            cancelled_at: now,
            cancellation_reason: "Cancelada por reembolso de soporte",
            updated_at: now,
          })
          .eq("id", reservationId);
      }

      const customerId = (tx.customer_user_id as string | null) ?? (reservation.for_user_id as string | null) ?? (reservation.organizer_id as string);
      if (customerId) {
        await notify({
          userId: customerId,
          role: "user",
          kind: "refund_completed",
          title: "Reembolso registrado",
          body: `Registramos el reembolso de USD ${((tx.amount_cents as number) / 100).toFixed(2)}. La devolución se completa fuera de la app según la referencia de soporte.`,
          payload: {
            transaction_id: tx.id,
            transaction_kind: "reservation",
            ref_id: reservationId,
            amount_cents: tx.amount_cents,
            currency: tx.currency,
            reason,
            refund_reference: refundReference ?? null,
          },
        });
      }

      revalidatePath("/dashboard/admin/admin-reservas");
      revalidatePath("/dashboard/user/mis-reservas");
      return { ok: true as const };
    },
  );
}
