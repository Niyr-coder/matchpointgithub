"use server";

// Support tickets. Opener creates + replies; staff and admin can also reply.
// Internal messages stay hidden from the opener.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import {
  TicketCreateSchema,
  TicketDetailSchema,
  TicketMessageSchema,
  TicketReplySchema,
  TicketSchema,
  TicketStatusSchema,
  type Ticket,
  type TicketDetail,
} from "@/lib/schemas/ops";
import { UuidSchema } from "@/lib/schemas/common";
import { notifyAdmins } from "@/server/notifications/dispatch";

function mapTicket(row: Record<string, unknown>): Ticket {
  return TicketSchema.parse({
    id: row.id,
    code: row.code,
    clubId: (row.club_id as string | null) ?? null,
    openerId: row.opener_id,
    assigneeId: (row.assignee_id as string | null) ?? null,
    subject: row.subject,
    category: row.category,
    severity: row.severity,
    status: row.status,
    firstResponseAt: (row.first_response_at as string | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    closedAt: (row.closed_at as string | null) ?? null,
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
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: id,
        author_id: userId,
        body: body.body,
        internal: body.internal,
      } as never)
      .select()
      .single();
    if (error) {
      if (error.code === "42501") {
        throw new AuthError("AUTH.ROLE_REQUIRED", "Not visible to you");
      }
      throw new MpError("TICKETS.REPLY_FAILED", error.message, 500);
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
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from("tickets")
      .update({
        assignee_id: assigneeId,
        status: assigneeId ? "in_progress" : "open",
      } as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) throw new MpError("TICKETS.NOT_FOUND", "Ticket not found", 404);
    return mapTicket(data);
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
      .select("id")
      .is("assignee_id", null)
      .in("status", ["open", "in_progress", "waiting_user"]);
    const unassigned = (openTickets ?? []).map((t) => t.id as string);
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
    for (const ticketId of unassigned) {
      let bestId = adminIds[0];
      let bestLoad = load.get(bestId) ?? 0;
      for (const id of adminIds) {
        const cur = load.get(id) ?? 0;
        if (cur < bestLoad) {
          bestId = id;
          bestLoad = cur;
        }
      }
      const { error } = await supabase
        .from("tickets")
        .update({ assignee_id: bestId, status: "in_progress" } as never)
        .eq("id", ticketId);
      if (error) continue;
      load.set(bestId, (load.get(bestId) ?? 0) + 1);
      assigned++;
    }
    return { assigned };
  });
}

// ── closeTicket ────────────────────────────────────────────────────────
export async function closeTicket(input: unknown): Promise<ActionResult<Ticket>> {
  return runAction(z.object({ id: UuidSchema }), input, async ({ id }) => {
    const supabase = await getServerClient();
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
    return mapTicket(data);
  });
}
