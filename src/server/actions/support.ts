"use server";

// Support tickets. Opener creates + replies; staff and admin can also reply.
// Internal messages stay hidden from the opener.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  TicketCreateSchema,
  TicketDetailSchema,
  TicketMessageSchema,
  TicketReplySchema,
  TicketStatusSchema,
  type Ticket,
  type TicketDetail,
} from "@/lib/schemas/ops";
import { mapTicket } from "@/lib/support/ticket-map";
import { UuidSchema } from "@/lib/schemas/common";
import { notify, notifyAdmins } from "@/server/notifications/dispatch";

type TicketStatus = Ticket["status"];

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  return user.id;
}

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  return !!data;
}

type TicketAccessRow = {
  status: string;
  assignee_id: string | null;
  club_id: string | null;
  opener_id: string;
};

async function loadTicketAccess(id: string): Promise<TicketAccessRow> {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("status, assignee_id, club_id, opener_id")
    .eq("id", id)
    .single();
  if (error || !data) throw new MpError("TICKETS.NOT_FOUND", "Ticket not found", 404);
  return data as TicketAccessRow;
}

async function canStaffTicket(userId: string, ticket: TicketAccessRow): Promise<boolean> {
  if (await isPlatformAdmin(userId)) return true;
  if (ticket.assignee_id === userId) return true;
  if (!ticket.club_id) return false;
  const supabase = await getServerClient();
  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", userId)
    .eq("club_id", ticket.club_id)
    .in("role", ["owner", "manager", "employee"])
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  return !!data;
}

function ticketStatusPatch(status: TicketStatus): Record<string, unknown> {
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "resolved") patch.resolved_at = new Date().toISOString();
  if (status === "closed") patch.closed_at = new Date().toISOString();
  return patch;
}

const STATUS_NOTIFICATION_COPY: Partial<Record<TicketStatus, { title: string; body: (ticket: Ticket) => string }>> = {
  in_progress: {
    title: "Tu ticket está en atención",
    body: (ticket) => `Estamos revisando el ticket ${ticket.code}: ${ticket.subject}.`,
  },
  waiting_user: {
    title: "Necesitamos más información",
    body: (ticket) => `Revisa el ticket ${ticket.code}: necesitamos un dato adicional para continuar.`,
  },
  resolved: {
    title: "Tu ticket fue resuelto",
    body: (ticket) => `Resolvimos el ticket ${ticket.code}: ${ticket.subject}.`,
  },
  closed: {
    title: "Tu ticket fue cerrado",
    body: (ticket) => `Cerramos el ticket ${ticket.code}: ${ticket.subject}.`,
  },
};

async function notifyTicketStatusChanged(ticket: Ticket, previousStatus: TicketStatus | null): Promise<void> {
  if (previousStatus === ticket.status) return;

  const copy = STATUS_NOTIFICATION_COPY[ticket.status];
  if (!copy) return;

  await notify({
    userId: ticket.openerId,
    role: "user",
    kind: "ticket_status_changed",
    title: copy.title,
    body: copy.body(ticket),
    payload: {
      ticketId: ticket.id,
      code: ticket.code,
      previousStatus,
      status: ticket.status,
      subject: ticket.subject,
      category: ticket.category,
      severity: ticket.severity,
    },
  });
}

// ── listMyTickets ──────────────────────────────────────────────────────
export async function listMyTickets(
  input: unknown,
): Promise<ActionResult<Ticket[]>> {
  return runAction(
    z.object({
      status: TicketStatusSchema.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
    input,
    async ({ status, limit }) => {
      const userId = await requireUserId();
      const supabase = await getServerClient();
      let q = supabase
        .from("tickets")
        .select("*")
        .eq("opener_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw new MpError("TICKETS.DB_ERROR", error.message, 500);
      return (data ?? []).map(mapTicket);
    },
  );
}

// ── createTicket ───────────────────────────────────────────────────────
export async function createTicket(input: unknown): Promise<ActionResult<Ticket>> {
  return runAction(TicketCreateSchema, input, async (data) => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        club_id: data.clubId ?? null,
        opener_id: userId,
        subject: data.subject,
        category: data.category,
        severity: data.severity,
        status: "open",
      } as never)
      .select()
      .single();
    if (error) throw new MpError("TICKETS.CREATE_FAILED", error.message, 500);

    // First message is the body.
    await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: ticket.id,
        author_id: userId,
        body: data.body,
        internal: false,
      } as never);

    await notifyAdmins({
      kind: "ticket_new",
      title: "Nuevo ticket de soporte",
      body: data.subject,
      payload: { ticketId: ticket.id, severity: data.severity, category: data.category },
    });

    return mapTicket(ticket);
  });
}

// ── getTicket (detail) ─────────────────────────────────────────────────
export async function getTicket(input: unknown): Promise<ActionResult<TicketDetail>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const [{ data: ticket, error }, { data: messages }] = await Promise.all([
      supabase.from("tickets").select("*").eq("id", id).single(),
      supabase
        .from("ticket_messages")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true }),
    ]);
    if (error || !ticket) throw new MpError("TICKETS.NOT_FOUND", "Ticket not found", 404);
    const detail: TicketDetail = {
      ticket: mapTicket(ticket),
      messages: (messages ?? []).map((m) =>
        TicketMessageSchema.parse({
          id: m.id,
          ticketId: m.ticket_id,
          authorId: m.author_id,
          body: m.body,
          internal: m.internal,
          createdAt: m.created_at,
        }),
      ),
    };
    return TicketDetailSchema.parse(detail);
  });
}

// ── replyToTicket ──────────────────────────────────────────────────────
const ReplyInputSchema = z.object({
  id: UuidSchema,
  body: TicketReplySchema,
});

export async function replyToTicket(
  input: unknown,
): Promise<ActionResult<z.infer<typeof TicketMessageSchema>>> {
  return runAction(ReplyInputSchema, input, async ({ id, body }) => {
    const userId = await requireUserId();
    const ticket = await loadTicketAccess(id);
    const isOpener = ticket.opener_id === userId;
    const canStaff = await canStaffTicket(userId, ticket);
    if (!isOpener && !canStaff) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "No tienes permiso para responder este ticket");
    }

    const row = {
      ticket_id: id,
      author_id: userId,
      body: body.body,
      internal: body.internal,
    };

    let data;
    if (!isOpener && (await isPlatformAdmin(userId))) {
      const admin = getAdminClient();
      await setAuditActor(admin, userId, "admin");
      const res = await admin.from("ticket_messages").insert(row as never).select().single();
      if (res.error) throw new MpError("TICKETS.REPLY_FAILED", res.error.message, 500);
      data = res.data;
    } else {
      const supabase = await getServerClient();
      const { data: inserted, error } = await supabase
        .from("ticket_messages")
        .insert(row as never)
        .select()
        .single();
      if (error) {
        if (error.code === "42501") {
          throw new AuthError("AUTH.ROLE_REQUIRED", "Not visible to you");
        }
        throw new MpError("TICKETS.REPLY_FAILED", error.message, 500);
      }
      data = inserted;
    }

    return TicketMessageSchema.parse({
      id: data.id,
      ticketId: data.ticket_id,
      authorId: data.author_id,
      body: data.body,
      internal: data.internal,
      createdAt: data.created_at,
    });
  });
}

// ── assignTicket (admin/staff) ─────────────────────────────────────────
const AssignTicketSchema = z.object({
  id: UuidSchema,
  assigneeId: UuidSchema.nullable(),
});

export async function assignTicket(input: unknown): Promise<ActionResult<Ticket>> {
  return runAction(AssignTicketSchema, input, async ({ id, assigneeId }) => {
    const userId = await requireUserId();
    const ticket = await loadTicketAccess(id);
    if (!(await canStaffTicket(userId, ticket))) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "No tienes permiso para asignar este ticket");
    }

    const previousStatus = TicketStatusSchema.parse(ticket.status);
    const patch = {
      assignee_id: assigneeId,
      status: assigneeId ? "in_progress" : "open",
      updated_at: new Date().toISOString(),
    };

    let data;
    if (await isPlatformAdmin(userId)) {
      const admin = getAdminClient();
      await setAuditActor(admin, userId, "admin");
      const res = await admin.from("tickets").update(patch as never).eq("id", id).select().single();
      if (res.error || !res.data) throw new MpError("TICKETS.NOT_FOUND", "Ticket not found", 404);
      data = res.data;
    } else {
      const supabase = await getServerClient();
      const { data: updated, error } = await supabase
        .from("tickets")
        .update(patch as never)
        .eq("id", id)
        .select()
        .single();
      if (error || !updated) throw new MpError("TICKETS.NOT_FOUND", "Ticket not found", 404);
      data = updated;
    }

    if (assigneeId) {
      await notify({
        userId: assigneeId,
        role: "admin",
        kind: "ticket_assigned",
        title: "Ticket asignado",
        body: `Te asignaron el ticket ${data.code ?? data.id}.`,
        payload: { ticketId: data.id, code: data.code, category: data.category, severity: data.severity },
      });
    }
    const mapped = mapTicket(data);
    await notifyTicketStatusChanged(mapped, previousStatus);
    return mapped;
  });
}

// ── autoAssignTickets (admin) ──────────────────────────────────────────
// Reparte los tickets sin asignar entre los admins activos usando round-robin
// por carga actual (asignado a quien menos tickets abiertos tiene).
export async function autoAssignTickets(): Promise<ActionResult<{ assigned: number }>> {
  return runAction(z.undefined(), undefined, async () => {
    const supabase = await getServerClient();
    const { data: meUser } = await supabase.auth.getUser();
    if (!meUser.user) throw new MpError("AUTH.UNAUTHENTICATED", "Sign in required", 401);
    const { data: meAdmin } = await supabase
      .from("role_assignments")
      .select("role")
      .eq("user_id", meUser.user.id)
      .eq("role", "admin")
      .is("revoked_at", null)
      .maybeSingle();
    if (!meAdmin) throw new MpError("AUTH.ROLE_REQUIRED", "Admin required", 403);

    const { data: admins } = await supabase
      .from("role_assignments")
      .select("user_id")
      .eq("role", "admin")
      .is("revoked_at", null);
    const adminIds = Array.from(new Set((admins ?? []).map((a) => a.user_id as string)));
    if (adminIds.length === 0) {
      throw new MpError("TICKETS.NO_ADMINS", "No hay admins activos para asignar", 422);
    }

    const { data: openTickets } = await supabase
      .from("tickets")
      .select("id,status")
      .is("assignee_id", null)
      .in("status", ["open", "in_progress", "waiting_user"]);
    const unassigned = (openTickets ?? []).map((t) => ({
      id: t.id as string,
      previousStatus: TicketStatusSchema.parse(t.status),
    }));
    if (unassigned.length === 0) return { assigned: 0 };

    const { data: existing } = await supabase
      .from("tickets")
      .select("assignee_id")
      .in("assignee_id", adminIds)
      .in("status", ["open", "in_progress", "waiting_user"]);
    const load = new Map<string, number>();
    for (const id of adminIds) load.set(id, 0);
    for (const t of existing ?? []) {
      const aid = t.assignee_id as string | null;
      if (aid) load.set(aid, (load.get(aid) ?? 0) + 1);
    }

    let assigned = 0;
    for (const ticket of unassigned) {
      let bestId = adminIds[0];
      let bestLoad = load.get(bestId) ?? 0;
      for (const id of adminIds) {
        const cur = load.get(id) ?? 0;
        if (cur < bestLoad) {
          bestId = id;
          bestLoad = cur;
        }
      }
      const { data: updated, error } = await supabase
        .from("tickets")
        .update({ assignee_id: bestId, status: "in_progress" } as never)
        .eq("id", ticket.id)
        .select()
        .single();
      if (error || !updated) continue;
      load.set(bestId, (load.get(bestId) ?? 0) + 1);
      await notifyTicketStatusChanged(mapTicket(updated), ticket.previousStatus);
      assigned++;
    }
    return { assigned };
  });
}

// ── updateTicketStatus (admin/staff) ───────────────────────────────────
const UpdateTicketStatusSchema = z.object({
  id: UuidSchema,
  status: z.enum(["in_progress", "waiting_user", "resolved", "closed"]),
});

export async function updateTicketStatus(input: unknown): Promise<ActionResult<Ticket>> {
  return runAction(UpdateTicketStatusSchema, input, async ({ id, status }) => {
    const userId = await requireUserId();
    const ticket = await loadTicketAccess(id);
    if (!(await canStaffTicket(userId, ticket))) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "No tienes permiso para actualizar este ticket");
    }

    const previousStatus = TicketStatusSchema.parse(ticket.status);
    const patch = ticketStatusPatch(status);

    let data;
    if (await isPlatformAdmin(userId)) {
      const admin = getAdminClient();
      await setAuditActor(admin, userId, "admin");
      const res = await admin.from("tickets").update(patch as never).eq("id", id).select().single();
      if (res.error || !res.data) throw new MpError("TICKETS.NOT_FOUND", "Ticket not found", 404);
      data = res.data;
    } else {
      const supabase = await getServerClient();
      const { data: updated, error } = await supabase
        .from("tickets")
        .update(patch as never)
        .eq("id", id)
        .select()
        .single();
      if (error || !updated) throw new MpError("TICKETS.NOT_FOUND", "Ticket not found", 404);
      data = updated;
    }

    const mapped = mapTicket(data);
    await notifyTicketStatusChanged(mapped, previousStatus);
    return mapped;
  });
}

// ── closeTicket ────────────────────────────────────────────────────────
export async function closeTicket(input: unknown): Promise<ActionResult<Ticket>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
    const { data: current, error: currentError } = await supabase
      .from("tickets")
      .select("status")
      .eq("id", id)
      .single();
    if (currentError || !current) throw new MpError("TICKETS.NOT_FOUND", "Ticket not found", 404);

    const { data, error } = await supabase
      .from("tickets")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
      } as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) throw new MpError("TICKETS.NOT_FOUND", "Ticket not found", 404);
    const ticket = mapTicket(data);
    await notifyTicketStatusChanged(ticket, TicketStatusSchema.parse(current.status));
    return ticket;
  });
}
