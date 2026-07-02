/** Copy legible para kinds de notificación (client-safe). */

import { humanizeSnakeCase, looksLikeBackendToken } from "./labels";

/** Título corto cuando el backend guarda el kind o un slug crudo. */
export const NOTIFICATION_KIND_TITLES: Record<string, string> = {
  welcome_owner: "Bienvenida al portal del club",
  mp_plus_activated: "MATCHPOINT+ activado",
  mp_plus_revoked: "MATCHPOINT+ desactivado",
  payment_captured: "Pago confirmado",
  payment_proof_rejected: "Comprobante rechazado",
  refund_completed: "Reembolso completado",
  broadcast: "Aviso de MATCHPOINT",
  report_resolved: "Reporte resuelto",
  role_request_created: "Solicitud de rol enviada",
  role_request_approved: "Solicitud de rol aprobada",
  role_request_rejected: "Solicitud de rol rechazada",
  role_assigned: "Nuevo rol asignado",
  role_revoked: "Rol revocado",
  club_application_created: "Solicitud de club enviada",
  club_application_status: "Actualización de tu solicitud",
  club_application_approved: "Club aprobado",
  club_application_rejected: "Solicitud rechazada",
  reservation_confirmed: "Reserva confirmada",
  reservation_cancelled: "Reserva cancelada",
  reservation_reminder: "Recordatorio de reserva",
  club_reservation_new: "Nueva reserva en tu club",
  reservation_no_show: "No-show registrado",
  ticket_created: "Ticket de soporte creado",
  ticket_status_changed: "Actualización de tu ticket",
  ticket_assigned: "Ticket asignado",
  friend_request_received: "Nueva solicitud de amistad",
  friend_request_accepted: "Solicitud aceptada",
  match_challenge_received: "Te retaron a un duelo",
  match_challenge_accepted: "Reto aceptado",
  match_challenge_declined: "Reto rechazado",
  match_cancelled: "Partido cancelado",
  match_rescheduled: "Partido reprogramado",
  match_result_reported: "Resultado reportado",
  match_no_show_reported: "No-show reportado",
  match_seek_applied: "Nueva postulación",
  match_seek_accepted: "Te aceptaron al partido",
  match_seek_partner_invited: "Invitación de dupla",
  team_invite_received: "Invitación al team",
  team_member_joined: "Nuevo miembro en tu team",
  team_member_kicked: "Fuiste expulsado del team",
  team_roster_cap_reached: "Plantilla completa",
  quedada_joined: "Alguien se unió a tu quedada",
  quedada_invite: "Invitación a quedada",
  quedada_cancelled: "Quedada cancelada",
  quedada_rescheduled: "Quedada reprogramada",
  quedada_payment_reminder: "Pago pendiente",
  quedada_cohost_added: "Te hicieron co-host",
  club_membership_requested: "Solicitud de membresía",
  club_membership_approved: "Membresía aprobada",
  club_membership_rejected: "Membresía rechazada",
  club_membership_chat_welcome: "Bienvenida al chat del club",
  club_announcement_new: "Nuevo anuncio del club",
  club_staff_assigned: "Te agregaron al staff",
  club_staff_removed: "Te quitaron del staff",
  tournament_published: "Torneo publicado",
  tournament_registration_new: "Nueva inscripción",
  tournament_cancelled: "Torneo cancelado",
  tournament_finished: "Torneo finalizado",
  tournament_match_ready: "Te toca jugar",
  player_substituted: "Fuiste sustituido en un torneo",
  player_substitution_added: "Fuiste agregado como reemplazo",
  match_walkover_declared: "Walkover declarado en tu partido",
  registration_accepted: "Inscripción aceptada",
  registration_rejected: "Inscripción rechazada",
  registration_waitlisted: "En lista de espera",
  waitlist_promoted: "Se liberó un cupo",
  payout_paid: "Pago registrado",
  refund_requested: "Reembolso pendiente",
  club_featuring_activated: "Featuring activado",
  club_featuring_expiring_soon: "Featuring por vencer",
  plan_expiring_soon: "Tu plan está por vencer",
  giveaway_started: "Sorteo iniciado",
  giveaway_drawn: "Sorteo realizado",
  giveaway_won: "¡Ganaste un sorteo!",
};

/** Descripción para preferencias cuando la DB trae el slug o copy técnico. */
export const NOTIFICATION_KIND_DESCRIPTIONS: Record<string, string> = {
  ...NOTIFICATION_KIND_TITLES,
  payment_captured: "Te avisamos cuando se confirma un pago",
  reservation_confirmed: "Confirmación de reserva en cancha",
  match_challenge_received: "Cuando alguien te reta a jugar",
  friend_request_received: "Cuando alguien quiere conectarse contigo",
  quedada_payment_reminder: "Recordatorio para completar el pago de una quedada",
  club_application_status: "Cambios en el estado de tu solicitud de club",
};

export function notificationKindLabel(kind: string, dbDescription?: string | null): string {
  if (NOTIFICATION_KIND_DESCRIPTIONS[kind]) return NOTIFICATION_KIND_DESCRIPTIONS[kind];
  const desc = dbDescription?.trim();
  if (desc && !looksLikeBackendToken(desc) && desc !== kind) return desc;
  return NOTIFICATION_KIND_TITLES[kind] ?? humanizeSnakeCase(kind);
}

export function resolveNotificationTitle(kind: string, title: string): string {
  const t = title.trim();
  if (!t || t === kind || looksLikeBackendToken(t)) {
    return NOTIFICATION_KIND_TITLES[kind] ?? humanizeSnakeCase(kind);
  }
  return t;
}
