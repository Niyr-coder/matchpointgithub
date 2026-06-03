import { TicketSchema, type Ticket } from "@/lib/schemas/ops";

export function mapTicket(row: Record<string, unknown>): Ticket {
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
