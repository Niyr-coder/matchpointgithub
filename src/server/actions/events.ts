"use server";

// Events: club/partner-hosted clinics, mixers, socials.
import "server-only";

import { z } from "zod";
import { headers } from "next/headers";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { getActiveClubDiscountPct, applyDiscount, hasActiveClubMembership } from "@/server/queries/club-membership";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { withIdempotency } from "@/lib/api/idempotency";
import {
  EventCreateSchema,
  EventListParamsSchema,
  EventRegistrationSchema,
  EventSchema,
  type EventRegistration,
  type EventRow,
} from "@/lib/schemas/events";
import { UuidSchema } from "@/lib/schemas/common";

function mapEvent(row: Record<string, unknown>): EventRow {
  return EventSchema.parse({
    id: row.id,
    clubId: (row.club_id as string | null) ?? null,
    partnerId: (row.partner_id as string | null) ?? null,
    organizerId: row.organizer_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    coverUrl: row.cover_url ?? null,
    kind: row.kind,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: (row.capacity as number | null) ?? null,
    priceCents: row.price_cents,
    currency: (row.currency as string | null) ?? null,
    paymentPolicy: (row.payment_policy as string | null) ?? "prepay",
    visibility: row.visibility,
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

async function assertCanCreateEvent(clubId?: string, partnerId?: string): Promise<string> {
  const userId = await requireUserId();
  if (!clubId && !partnerId) {
    throw new MpError("EVENTS.SCOPE_REQUIRED", "clubId or partnerId is required", 422);
  }
  const supabase = await getServerClient();
  if (clubId) {
    const { data: roles } = await supabase
      .from("role_assignments")
      .select("role,club_id")
      .eq("user_id", userId)
      .is("revoked_at", null);
    const ok = (roles ?? []).some(
      (r) =>
        r.role === "admin" ||
        (r.club_id === clubId && (r.role === "owner" || r.role === "manager")),
    );
    if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff required");
  } else if (partnerId) {
    const { data } = await supabase
      .from("partner_members")
      .select("role")
      .eq("partner_id", partnerId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data || !["owner", "admin"].includes(data.role as string)) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Partner-admin required");
    }
  }
  return userId;
}

// ── listEvents (public) ────────────────────────────────────────────────
export async function listEvents(input: unknown): Promise<ActionResult<EventRow[]>> {
  return runAction(EventListParamsSchema, input, async (params) => {
    const supabase = await getServerClient();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;
    let q = supabase
      .from("events")
      .select("*")
      .in("status", ["published", "registration_open", "registration_closed", "live"])
      .order("starts_at", { ascending: true })
      .range(from, to);
    if (params.clubId) q = q.eq("club_id", params.clubId);
    if (params.kind) q = q.eq("kind", params.kind);
    if (params.fromDate) q = q.gte("starts_at", params.fromDate);
    const { data, error } = await q;
    if (error) throw new MpError("EVENTS.DB_ERROR", error.message, 500);
    return (data ?? []).map(mapEvent);
  });
}

// ── getEvent (public) ──────────────────────────────────────────────────
export async function getEvent(input: unknown): Promise<ActionResult<EventRow>> {
  return runAction(z.object({ idOrSlug: z.string() }), input, async ({ idOrSlug }) => {
    const supabase = await getServerClient();
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const q = isUuid
      ? supabase.from("events").select("*").eq("id", idOrSlug).single()
      : supabase.from("events").select("*").eq("slug", idOrSlug).single();
    const { data, error } = await q;
    if (error || !data) throw new MpError("EVENTS.NOT_FOUND", "Event not found", 404);
    return mapEvent(data);
  });
}

// ── createEvent (staff/partner) ────────────────────────────────────────
export async function createEvent(input: unknown): Promise<ActionResult<EventRow>> {
  return runAction(EventCreateSchema, input, async (data) => {
    const userId = await assertCanCreateEvent(data.clubId, data.partnerId);
    const supabase = await getServerClient();
    // Normaliza payment_policy con el CHECK: 'free' iff price=0; si tiene
    // precio defaultea a 'prepay' salvo que el cliente pida 'onsite'/'flexible'.
    const resolvedPolicy =
      data.priceCents === 0
        ? "free"
        : data.paymentPolicy && data.paymentPolicy !== "free"
          ? data.paymentPolicy
          : "prepay";
    const { data: row, error } = await supabase
      .from("events")
      .insert({
        club_id: data.clubId ?? null,
        partner_id: data.partnerId ?? null,
        organizer_id: userId,
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        cover_url: data.coverUrl ?? null,
        kind: data.kind,
        status: "draft",
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        capacity: data.capacity ?? null,
        price_cents: data.priceCents,
        currency: data.currency ?? null,
        payment_policy: resolvedPolicy,
        visibility: data.visibility,
        members_only: data.membersOnly ?? false,
      } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new MpError("EVENTS.SLUG_TAKEN", "Event slug already exists", 409);
      }
      throw new MpError("EVENTS.CREATE_FAILED", error.message, 500);
    }
    return mapEvent(row);
  });
}

// ── publishEvent ───────────────────────────────────────────────────────
export async function publishEvent(input: unknown): Promise<ActionResult<EventRow>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: current } = await supabase
      .from("events")
      .select("organizer_id,club_id,partner_id,status")
      .eq("id", id)
      .single();
    if (!current) throw new MpError("EVENTS.NOT_FOUND", "Event not found", 404);
    if (current.organizer_id !== userId) {
      await assertCanCreateEvent(
        (current.club_id as string | undefined) ?? undefined,
        (current.partner_id as string | undefined) ?? undefined,
      );
    }
    if (current.status !== "draft") {
      throw new MpError("EVENTS.NOT_DRAFT", `Status is '${current.status}'`, 409);
    }
    const { data: updated, error } = await supabase
      .from("events")
      .update({ status: "published" } as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new MpError("EVENTS.PUBLISH_FAILED", error.message, 500);
    return mapEvent(updated);
  });
}

// ── registerToEvent (idempotent) ───────────────────────────────────────
// El comportamiento depende de event.payment_policy:
//   - free      → sin transaction; registración 'registered'.
//   - prepay    → transaction 'pending_proof' + registración 'pending_payment'.
//                 Admin aprueba comprobante en /pagos/[id] → captured + registered.
//   - onsite    → transaction 'pending' (cobro en mostrador) + registración
//                 'registered'. Admin marca captured cuando cobra en sitio.
//   - flexible  → el usuario decide via paymentMode ('online' | 'onsite').
// La capacidad cuenta 'registered' + 'pending_payment' (no oversell).
const RegisterToEventSchema = z.object({
  id: UuidSchema,
  paymentMode: z.enum(["online", "onsite"]).optional(),
});

export async function registerToEvent(input: unknown): Promise<ActionResult<EventRegistration>> {
  return runAction(RegisterToEventSchema, input, async ({ id, paymentMode }) => {
    const userId = await requireUserId();
    const idemKey = (await headers()).get("idempotency-key") ?? undefined;
    return withIdempotency(
      { key: idemKey, scope: "registerEvent", userId, input: { id, paymentMode } },
      async () => {
        const supabase = await getServerClient();
        const { data: event } = await supabase
          .from("events")
          .select("status,capacity,price_cents,currency,club_id,payment_policy,members_only")
          .eq("id", id)
          .single();
        if (!event) throw new MpError("EVENTS.NOT_FOUND", "Event not found", 404);
        if (!["published", "registration_open"].includes(event.status as string)) {
          throw new MpError(
            "EVENTS.NOT_REGISTERABLE",
            `Event status is '${event.status}'`,
            422,
          );
        }
        // Acceso solo-miembros: requiere membresía VIP activa del club del evento.
        if ((event.members_only as boolean) && event.club_id) {
          const isMember = await hasActiveClubMembership(userId, event.club_id as string);
          if (!isMember) {
            throw new MpError("EVENTS.MEMBERS_ONLY", "Este evento es solo para miembros VIP del club.", 403);
          }
        }
        if (event.capacity != null) {
          const { count } = await supabase
            .from("event_registrations")
            .select("*", { count: "exact", head: true })
            .eq("event_id", id)
            .in("status", ["registered", "pending_payment"]);
          if ((count ?? 0) >= (event.capacity as number)) {
            throw new MpError("EVENTS.FULL", "Event is at capacity", 409);
          }
        }

        const policy = (event.payment_policy as string) ?? "prepay";
        const priceCents = (event.price_cents as number) ?? 0;

        // Resolver mode efectivo según policy.
        let effectiveMode: "free" | "online" | "onsite";
        if (policy === "free" || priceCents === 0) {
          effectiveMode = "free";
        } else if (policy === "prepay") {
          effectiveMode = "online";
        } else if (policy === "onsite") {
          effectiveMode = "onsite";
        } else {
          // flexible
          if (!paymentMode) {
            throw new MpError(
              "EVENTS.PAYMENT_MODE_REQUIRED",
              "Este evento requiere elegir entre pago online u onsite",
              422,
            );
          }
          effectiveMode = paymentMode;
        }

        let paidTransactionId: string | null = null;
        if (effectiveMode !== "free") {
          // Descuento de membresía VIP del club del evento (si aplica).
          const evClubId = (event.club_id as string | null) ?? null;
          const evDiscountPct = evClubId ? await getActiveClubDiscountPct(userId, evClubId) : 0;
          const evChargeCents = applyDiscount(priceCents, evDiscountPct);
          const { data: tx, error: txErr } = await supabase
            .from("transactions")
            .insert({
              club_id: evClubId,
              kind: "event",
              ref_id: id,
              customer_user_id: userId,
              amount_cents: evChargeCents,
              currency: ((event.currency as string | null) ?? "USD"),
              method: "transfer",
              status: effectiveMode === "online" ? "pending_proof" : "pending",
              created_by: userId,
            } as never)
            .select("id")
            .single();
          if (txErr || !tx) {
            throw new MpError("EVENTS.TX_CREATE_FAILED", txErr?.message ?? "tx error", 500);
          }
          paidTransactionId = tx.id as string;
        }

        // Onsite y free → inscripción ya 'registered'. Online → 'pending_payment'.
        const registrationStatus =
          effectiveMode === "online" ? "pending_payment" : "registered";

        const { data: row, error } = await supabase
          .from("event_registrations")
          .insert({
            event_id: id,
            user_id: userId,
            status: registrationStatus,
            paid_transaction_id: paidTransactionId,
          } as never)
          .select()
          .single();
        if (error) {
          if (error.code === "23505") {
            throw new MpError("EVENTS.ALREADY_REGISTERED", "Already registered", 409);
          }
          throw new MpError("EVENTS.REGISTER_FAILED", error.message, 500);
        }
        return EventRegistrationSchema.parse({
          id: row.id,
          eventId: row.event_id,
          userId: row.user_id,
          status: row.status,
          paidTransactionId: (row.paid_transaction_id as string | null) ?? null,
          createdAt: row.created_at,
        });
      },
    );
  });
}

// ── Admin-only: cancelar evento + leer detalle con inscritos ────────────
async function requireAdminUserId(): Promise<string> {
  const userId = await requireUserId();
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Admin required");
  return userId;
}

const CancelEventSchema = z.object({
  eventId: UuidSchema,
  reason: z.string().min(2).max(500).optional(),
});

export async function cancelEvent(input: unknown): Promise<ActionResult<EventRow>> {
  return runAction(CancelEventSchema, input, async ({ eventId, reason }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const { data: existing } = await supabase
      .from("events")
      .select("status")
      .eq("id", eventId)
      .single();
    if (!existing) throw new MpError("EVENTS.NOT_FOUND", "Evento no encontrado", 404);
    if (existing.status === "cancelled") {
      throw new MpError("EVENTS.ALREADY_CANCELLED", "Ya estaba cancelado", 409);
    }
    if (existing.status === "finished") {
      throw new MpError("EVENTS.ALREADY_FINISHED", "No se puede cancelar un evento finalizado", 409);
    }
    const { data, error } = await supabase
      .from("events")
      .update({
        status: "cancelled",
        // No tenemos columna cancellation_reason; el motivo va al audit log.
      } as never)
      .eq("id", eventId)
      .select()
      .single();
    if (error) throw new MpError("EVENTS.CANCEL_FAILED", error.message, 500);
    // El audit_log se llena automáticamente por trigger 099_audit_triggers.
    void reason;
    return mapEvent(data);
  });
}

// Devuelve el evento + lista de inscritos hidratada + transactions asociadas.
export type AdminEventDetail = {
  event: EventRow;
  organizerName: string | null;
  organizerEmail: string | null;
  clubName: string | null;
  registrations: {
    id: string;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
    paidTransactionId: string | null;
    createdAt: string;
  }[];
  transactions: {
    id: string;
    amountCents: number;
    currency: string | null;
    method: string;
    status: string;
    customerName: string | null;
    createdAt: string;
  }[];
};

export async function getEventForAdmin(input: unknown): Promise<ActionResult<AdminEventDetail>> {
  return runAction(z.object({ eventId: UuidSchema }), input, async ({ eventId }) => {
    await requireAdminUserId();
    const supabase = await getServerClient();
    const { data: ev, error } = await supabase
      .from("events")
      .select("*,organizer:profiles!events_organizer_id_fkey(display_name),clubs(name)")
      .eq("id", eventId)
      .single();
    if (error || !ev) throw new MpError("EVENTS.NOT_FOUND", "Evento no encontrado", 404);

    const [{ data: regs }, { data: txs }] = await Promise.all([
      supabase
        .from("event_registrations")
        .select("id,user_id,status,paid_transaction_id,created_at,profiles!event_registrations_user_id_fkey(display_name,avatar_url)")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false }),
      supabase
        .from("transactions")
        .select("id,amount_cents,currency,method,status,customer_name,created_at")
        .eq("kind", "event")
        .eq("ref_id", eventId)
        .order("created_at", { ascending: false }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizer = (ev as any).organizer as { display_name?: string } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const club = (ev as any).clubs as { name?: string } | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const organizerId = (ev as any).organizer_id as string | null;

    // Email vive en auth.users (no en profiles): solo accesible vía service role.
    let organizerEmail: string | null = null;
    if (organizerId) {
      const { data: userData } = await getAdminClient().auth.admin.getUserById(organizerId);
      organizerEmail = userData.user?.email ?? null;
    }

    return {
      event: mapEvent(ev),
      organizerName: organizer?.display_name ?? null,
      organizerEmail,
      clubName: club?.name ?? null,
      registrations: (regs ?? []).map((r) => {
        const prof = r.profiles as { display_name?: string; avatar_url?: string | null } | null;
        return {
          id: r.id as string,
          userId: r.user_id as string,
          displayName: prof?.display_name ?? "Usuario",
          avatarUrl: prof?.avatar_url ?? null,
          status: r.status as string,
          paidTransactionId: (r.paid_transaction_id as string | null) ?? null,
          createdAt: r.created_at as string,
        };
      }),
      transactions: (txs ?? []).map((t) => ({
        id: t.id as string,
        amountCents: t.amount_cents as number,
        currency: (t.currency as string | null) ?? null,
        method: t.method as string,
        status: t.status as string,
        customerName: (t.customer_name as string | null) ?? null,
        createdAt: t.created_at as string,
      })),
    };
  });
}
