// Etiquetas legibles para filas de audit_log (entity + action).
// Usado en Admin Home «Actividad en vivo», timeline de eventos, etc.

export type AuditEntityMeta = {
  tag: string;
  color: string;
  icon: string;
};

/** Entidades de alto volumen / bajo valor en el feed resumido del admin. */
export const AUDIT_HOME_NOISE_ENTITIES = new Set([
  "conversation_members", // last_read_at en cada apertura de chat
  "message_reads",
]);

const ENTITY_META: Record<string, AuditEntityMeta> = {
  clubs: { tag: "CLUB", color: "#0ea5e9", icon: "building-2" },
  club_applications: { tag: "CLUB", color: "#0ea5e9", icon: "building-2" },
  club_settings: { tag: "CLUB", color: "#0ea5e9", icon: "building-2" },
  events: { tag: "EVENTO", color: "#fbbf24", icon: "trophy" },
  event_registrations: { tag: "EVENTO", color: "#fbbf24", icon: "calendar-check" },
  tournaments: { tag: "TORNEO", color: "#fbbf24", icon: "trophy" },
  registrations: { tag: "TORNEO", color: "#fbbf24", icon: "users" },
  transactions: { tag: "PAGO", color: "#10b981", icon: "wallet" },
  refunds: { tag: "PAGO", color: "#10b981", icon: "rotate-ccw" },
  reports: { tag: "MOD", color: "#dc2626", icon: "alert-triangle" },
  moderation_actions: { tag: "MOD", color: "#dc2626", icon: "shield-alert" },
  profiles: { tag: "USUARIO", color: "#7c3aed", icon: "user" },
  role_assignments: { tag: "ROLES", color: "#7c3aed", icon: "key" },
  role_requests: { tag: "ROLES", color: "#7c3aed", icon: "key" },
  reservations: { tag: "RESERVA", color: "var(--primary)", icon: "calendar-check" },
  tickets: { tag: "SOPORTE", color: "#0ea5e9", icon: "life-buoy" },
  ticket_messages: { tag: "SOPORTE", color: "#0ea5e9", icon: "message-square" },
  conversations: { tag: "MENSAJES", color: "#6366f1", icon: "message-square" },
  conversation_members: { tag: "MENSAJES", color: "#6366f1", icon: "message-square" },
  messages: { tag: "MENSAJES", color: "#6366f1", icon: "message-square" },
  match_results: { tag: "PARTIDO", color: "#10b981", icon: "swords" },
  match_seeks: { tag: "BUSCO", color: "#6366f1", icon: "users" },
  match_seek_applications: { tag: "BUSCO", color: "#6366f1", icon: "user-plus" },
  teams: { tag: "TEAM", color: "#0ea5e9", icon: "users-round" },
  feature_flags: { tag: "CONFIG", color: "#f59e0b", icon: "flag" },
  feature_flag_assignments: { tag: "CONFIG", color: "#f59e0b", icon: "flag" },
  broadcasts: { tag: "AVISO", color: "#f59e0b", icon: "megaphone" },
  club_giveaways: { tag: "SORTEO", color: "#10b981", icon: "gift" },
  club_giveaway_entries: { tag: "SORTEO", color: "#10b981", icon: "gift" },
  quedadas: { tag: "QUEDADA", color: "#ec4899", icon: "party-popper" },
  check_ins: { tag: "CHECK-IN", color: "var(--primary)", icon: "user-check" },
  products: { tag: "SHOP", color: "#0ea5e9", icon: "shopping-bag" },
  sales: { tag: "SHOP", color: "#0ea5e9", icon: "shopping-bag" },
};

const SUMMARY_BY_ENTITY: Record<
  string,
  Partial<Record<"INSERT" | "UPDATE" | "DELETE", string>>
> = {
  clubs: {
    INSERT: "Nuevo club registrado",
    UPDATE: "Club actualizado",
    DELETE: "Club eliminado",
  },
  club_applications: {
    INSERT: "Nueva solicitud de club",
    UPDATE: "Solicitud de club actualizada",
    DELETE: "Solicitud de club eliminada",
  },
  events: {
    INSERT: "Evento creado",
    UPDATE: "Evento editado",
    DELETE: "Evento eliminado",
  },
  event_registrations: {
    INSERT: "Nueva inscripción a evento",
    UPDATE: "Inscripción a evento actualizada",
    DELETE: "Inscripción a evento cancelada",
  },
  tournaments: {
    INSERT: "Torneo creado",
    UPDATE: "Torneo editado",
    DELETE: "Torneo eliminado",
  },
  registrations: {
    INSERT: "Nueva inscripción a torneo",
    UPDATE: "Inscripción a torneo actualizada",
    DELETE: "Inscripción a torneo cancelada",
  },
  transactions: {
    INSERT: "Nuevo pago registrado",
    UPDATE: "Pago actualizado",
    DELETE: "Pago eliminado",
  },
  refunds: {
    INSERT: "Reembolso iniciado",
    UPDATE: "Reembolso actualizado",
    DELETE: "Reembolso eliminado",
  },
  reports: {
    INSERT: "Nuevo reporte de moderación",
    UPDATE: "Reporte revisado",
    DELETE: "Reporte cerrado",
  },
  profiles: {
    INSERT: "Perfil de usuario creado",
    UPDATE: "Perfil de usuario actualizado",
    DELETE: "Perfil de usuario eliminado",
  },
  role_assignments: {
    INSERT: "Rol asignado a usuario",
    UPDATE: "Asignación de rol actualizada",
    DELETE: "Rol revocado",
  },
  reservations: {
    INSERT: "Nueva reserva",
    UPDATE: "Reserva modificada",
    DELETE: "Reserva cancelada",
  },
  tickets: {
    INSERT: "Ticket de soporte abierto",
    UPDATE: "Ticket de soporte actualizado",
    DELETE: "Ticket de soporte cerrado",
  },
  conversations: {
    INSERT: "Nueva conversación",
    UPDATE: "Conversación actualizada",
    DELETE: "Conversación eliminada",
  },
  conversation_members: {
    INSERT: "Usuario agregado a un chat",
    UPDATE: "Estado del chat actualizado",
    DELETE: "Usuario salió de un chat",
  },
  messages: {
    INSERT: "Mensaje enviado",
    UPDATE: "Mensaje editado",
    DELETE: "Mensaje eliminado",
  },
  match_results: {
    INSERT: "Resultado de partido registrado",
    UPDATE: "Resultado de partido corregido",
    DELETE: "Resultado de partido eliminado",
  },
  match_seeks: {
    INSERT: "Nuevo aviso busco partido",
    UPDATE: "Aviso busco partido actualizado",
    DELETE: "Aviso busco partido cancelado",
  },
  match_seek_applications: {
    INSERT: "Nueva postulación a aviso",
    UPDATE: "Postulación actualizada",
    DELETE: "Postulación retirada",
  },
  teams: {
    INSERT: "Team creado",
    UPDATE: "Team actualizado",
    DELETE: "Team eliminado",
  },
  feature_flags: {
    INSERT: "Feature flag creado",
    UPDATE: "Feature flag actualizado",
    DELETE: "Feature flag eliminado",
  },
  broadcasts: {
    INSERT: "Aviso global publicado",
    UPDATE: "Aviso global editado",
    DELETE: "Aviso global retirado",
  },
  club_giveaways: {
    INSERT: "Sorteo creado",
    UPDATE: "Sorteo actualizado",
    DELETE: "Sorteo eliminado",
  },
  club_giveaway_entries: {
    INSERT: "Entrada a sorteo registrada",
    UPDATE: "Entrada a sorteo actualizada",
    DELETE: "Entrada a sorteo eliminada",
  },
  quedadas: {
    INSERT: "Quedada creada",
    UPDATE: "Quedada actualizada",
    DELETE: "Quedada cancelada",
  },
  check_ins: {
    INSERT: "Check-in registrado",
    UPDATE: "Check-in actualizado",
    DELETE: "Check-in anulado",
  },
};

const ENTITY_NOUN: Record<string, string> = {
  clubs: "club",
  events: "evento",
  tournaments: "torneo",
  transactions: "transacción",
  profiles: "perfil",
  reservations: "reserva",
  messages: "mensaje",
  conversations: "conversación",
  conversation_members: "chat",
  reports: "reporte",
  registrations: "inscripción",
  event_registrations: "inscripción",
  role_assignments: "rol",
  teams: "team",
  products: "producto",
  sales: "venta",
  match_seeks: "aviso busco partido",
  match_seek_applications: "postulación",
};

const ACTION_FALLBACK: Record<"INSERT" | "UPDATE" | "DELETE", string> = {
  INSERT: "creado",
  UPDATE: "actualizado",
  DELETE: "eliminado",
};

function normalizeAction(action: string): "INSERT" | "UPDATE" | "DELETE" | null {
  const a = action.toUpperCase();
  if (a === "INSERT" || a === "UPDATE" || a === "DELETE") return a;
  return null;
}

/** Título corto en español para mostrar en UI (no técnico). */
export function summarizeAuditEvent(entity: string, action: string): string {
  const op = normalizeAction(action);
  if (op) {
    const specific = SUMMARY_BY_ENTITY[entity]?.[op];
    if (specific) return specific;
    const noun = ENTITY_NOUN[entity] ?? entity.replace(/_/g, " ");
    const verb = ACTION_FALLBACK[op];
    return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} ${verb}`;
  }
  // Acciones custom (ej. tournament.cancelled) — legible sin puntos técnicos.
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function auditEntityMeta(entity: string): AuditEntityMeta {
  return (
    ENTITY_META[entity] ?? {
      tag: entity.replace(/_/g, " ").slice(0, 12).toUpperCase(),
      color: "var(--muted-fg)",
      icon: "circle",
    }
  );
}

/** Subtítulo del feed: quién hizo la acción (sin IDs crudos). */
export function auditActivitySubtitle(actorLabel: string | null): string {
  if (actorLabel) return `Por ${actorLabel}`;
  return "Acción del sistema";
}
