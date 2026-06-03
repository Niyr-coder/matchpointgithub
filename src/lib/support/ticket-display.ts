import type { Ticket } from "@/lib/schemas/ops";

export type PlayerTicketRow = {
  id: string;
  code: string;
  topic: string;
  cat: string;
  status: Ticket["status"];
  priority: Ticket["severity"];
  lastAt: string;
};

export const UI_CATEGORY_LABELS: Record<string, string> = {
  reservas: "Reservas",
  pagos: "Pagos & facturación",
  quedadas: "Quedadas",
  torneos: "Torneos",
  coaching: "Coaching",
  cuenta: "Cuenta",
  bug: "Reporte de error",
};

export const UI_TO_TICKET_CATEGORY: Record<
  string,
  "maintenance" | "system" | "customer" | "billing" | "other"
> = {
  reservas: "customer",
  pagos: "billing",
  quedadas: "customer",
  torneos: "customer",
  coaching: "customer",
  cuenta: "customer",
  bug: "system",
};

export const UI_TO_SEVERITY: Record<string, Ticket["severity"]> = {
  low: "low",
  normal: "medium",
  urgent: "high",
};

export function ticketCategoryLabel(category: string): string {
  if (category === "maintenance") return "Mantenimiento";
  if (category === "system") return "Sistema";
  if (category === "customer") return "General";
  if (category === "billing") return "Pagos & facturación";
  return "Otro";
}

export function ticketStatusLabel(status: Ticket["status"]): string {
  if (status === "open") return "Abierto";
  if (status === "in_progress") return "En atención";
  if (status === "waiting_user") return "Esperando tu respuesta";
  if (status === "resolved") return "Resuelto";
  return "Cerrado";
}

export function ticketStatusPalette(status: Ticket["status"]): { bg: string; fg: string; l: string } {
  if (status === "open") return { bg: "rgba(16,185,129,0.12)", fg: "#047857", l: "Abierto" };
  if (status === "in_progress") return { bg: "#dbeafe", fg: "#1d4ed8", l: "En atención" };
  if (status === "waiting_user") return { bg: "#fef3c7", fg: "#92400e", l: "Esperando" };
  if (status === "resolved") return { bg: "var(--muted)", fg: "var(--muted-fg)", l: "Resuelto" };
  return { bg: "var(--muted)", fg: "var(--muted-fg)", l: "Cerrado" };
}

export function relativeTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} d`;
}

export function mapPlayerTicketRow(t: Ticket, now = new Date()): PlayerTicketRow {
  return {
    id: t.id,
    code: t.code,
    topic: t.subject,
    cat: ticketCategoryLabel(t.category),
    status: t.status,
    priority: t.severity,
    lastAt: relativeTime(t.updatedAt, now),
  };
}
